import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { db } from "../../db/client";
import { categories, expenses } from "../../db/schema";
import { eq, and } from "drizzle-orm";
import { decryptField } from "../../lib/encryption";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Compresses a 36-char UUID into a 22-char base64url string so
 * `setcat:<22>:<22>` is 52 bytes — safely within Telegram's 64-byte callback_data limit.
 */
function encodeUuid(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ""), "hex").toString("base64url");
}

function decodeUuid(value: string): string | null {
  if (UUID_REGEX.test(value)) return value;
  try {
    const buf = Buffer.from(value, "base64url");
    if (buf.length !== 16) return null;
    const hex = buf.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  } catch {
    return null;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}

/**
 * Handles the "✏️ Category" inline button — shows a grid of categories to pick from.
 * Callback data format: "cat:<expense-uuid>"
 */
export async function handleCategoryChange(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const expenseId = decodeUuid(data.split(":")[1] || "");
  const userId = ctx.from?.id;
  if (!expenseId || !userId) {
    return ctx.answerCallbackQuery({ text: "⚠️ Invalid request" });
  }

  // Verify expense exists and belongs to this user
  const [ownedExpense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
    .limit(1);

  if (!ownedExpense) {
    return ctx.answerCallbackQuery({ text: "⚠️ Expense not found" });
  }

  // Fetch user's categories
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  if (userCategories.length === 0) {
    return ctx.answerCallbackQuery({ text: "No categories found" });
  }

  const shortExpenseId = encodeUuid(expenseId);

  // Build inline keyboard with compact 52-byte callback_data (Telegram limit: 64 bytes)
  const keyboard = new InlineKeyboard();
  userCategories.forEach((cat, i) => {
    keyboard.text(
      `${cat.emoji ?? "💸"} ${cat.name}`,
      `setcat:${shortExpenseId}:${encodeUuid(cat.id)}`
    );
    // 2 categories per row
    if (i % 2 === 1) keyboard.row();
  });

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("📁 *Select a new category | اختر التصنيف الجديد:*", {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * Handles the actual category reassignment after user picks one.
 * Callback data format: "setcat:<short-expense-uuid>:<short-category-uuid>" (52 bytes)
 */
export async function handleCategorySelect(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parts = data.split(":");
  const expenseId = decodeUuid(parts[1] || "");
  const categoryId = decodeUuid(parts[2] || "");
  const userId = ctx.from?.id;
  if (!expenseId || !categoryId || !userId) {
    return ctx.answerCallbackQuery({ text: "⚠️ Invalid request" });
  }

  // Verify the chosen category belongs to this user (prevents cross-tenant category IDOR)
  const category = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .then((r) => r[0]);

  if (!category) {
    return ctx.answerCallbackQuery({ text: "⚠️ Category not found" });
  }

  // Strictly scope expense UPDATE by both expenseId AND userId (prevents IDOR)
  const updated = await db
    .update(expenses)
    .set({ categoryId: category.id })
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
    .returning();

  if (updated.length === 0) {
    return ctx.answerCallbackQuery({ text: "⚠️ Expense not found" });
  }

  const expense = updated[0];
  const categoryEmoji = category.emoji ?? "💸";
  const categoryName = category.name ?? "Unknown";

  const decryptedDesc = decryptField(expense.description, {
    userId,
    recordId: expense.id,
    field: "description",
  });

  await ctx.answerCallbackQuery({
    text: `✅ Category updated to ${categoryName}`,
  });

  // Rebuild the message with updated category + action buttons
  const keyboard = new InlineKeyboard()
    .text("❌ Undo", `undo:${expenseId}`)
    .text("✏️ Category", `cat:${expenseId}`);

  await ctx.editMessageText(
    `✅ *Logged:* ${Number(expense.amount).toFixed(2)} ${expense.currency} — _${escapeMarkdown(decryptedDesc)}_\n` +
      `📁 *Category:* ${categoryEmoji} ${escapeMarkdown(categoryName)}\n` +
      `✏️ _Category updated_`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}
