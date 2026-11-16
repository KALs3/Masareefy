import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { db } from "../../db/client";
import { categories, expenses } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Handles the "✏️ Category" inline button — shows a grid of categories to pick from.
 * Callback data format: "cat:<expense-uuid>"
 */
export async function handleCategoryChange(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const expenseId = data.split(":")[1];
  const userId = ctx.from?.id;
  if (!expenseId || !userId) return;

  // Fetch user's categories
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  if (userCategories.length === 0) {
    return ctx.answerCallbackQuery({ text: "No categories found" });
  }

  // Build inline keyboard with category options
  const keyboard = new InlineKeyboard();
  userCategories.forEach((cat, i) => {
    keyboard.text(
      `${cat.emoji ?? "💸"} ${cat.name}`,
      `setcat:${expenseId}:${cat.id}`
    );
    // 2 categories per row
    if (i % 2 === 1) keyboard.row();
  });

  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Select a new category:", {
    reply_markup: keyboard,
  });
}

/**
 * Handles the actual category reassignment after user picks one.
 * Callback data format: "setcat:<expense-uuid>:<category-uuid>"
 */
export async function handleCategorySelect(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const parts = data.split(":");
  const expenseId = parts[1];
  const categoryId = parts[2];
  const userId = ctx.from?.id;
  if (!expenseId || !categoryId || !userId) return;

  // Update the expense's category
  const updated = await db
    .update(expenses)
    .set({ categoryId })
    .where(eq(expenses.id, expenseId))
    .returning();

  if (updated.length === 0) {
    return ctx.answerCallbackQuery({ text: "⚠️ Expense not found" });
  }

  // Get the category details for the confirmation message
  const category = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .then((r) => r[0]);

  const expense = updated[0];
  const categoryEmoji = category?.emoji ?? "💸";
  const categoryName = category?.name ?? "Unknown";

  await ctx.answerCallbackQuery({
    text: `✅ Category updated to ${categoryName}`,
  });

  // Rebuild the message with updated category + action buttons
  const keyboard = new InlineKeyboard()
    .text("❌ Undo", `undo:${expenseId}`)
    .text("✏️ Category", `cat:${expenseId}`);

  await ctx.editMessageText(
    `✅ *Logged:* ${Number(expense.amount).toFixed(2)} ${expense.currency} — _${expense.description}_\n` +
      `📁 *Category:* ${categoryEmoji} ${categoryName}\n` +
      `✏️ _Category updated_`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}
