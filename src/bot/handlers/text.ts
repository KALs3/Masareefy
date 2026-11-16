import type { Context } from "grammy";
import { extractExpenseFromText } from "../../services/ai";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { InlineKeyboard } from "grammy";

/**
 * Handles incoming text messages:
 * 1. Fetches user profile and categories
 * 2. Sends text to Gemini for expense extraction
 * 3. Saves extracted expenses to DB
 * 4. Replies with confirmation + undo/recategorize buttons
 */
export async function handleTextMessage(ctx: Context) {
  const text = ctx.message?.text;
  const userId = ctx.from?.id;
  if (!text || !userId) return;

  // Skip commands (they're handled by bot.command())
  if (text.startsWith("/")) return;

  // Fetch user record
  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return ctx.reply("👋 Please run /start first to set up your account!");
  }

  // Fetch user's categories for the AI prompt
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryNames = userCategories.map((c) => c.name);

  // Send a "thinking" indicator
  await ctx.replyWithChatAction("typing");

  // Extract expense(s) via Gemini
  let result;
  try {
    result = await extractExpenseFromText(
      text,
      user.currency ?? "EGP",
      categoryNames,
      new Date().toISOString().split("T")[0]
    );
  } catch (error) {
    console.error("AI extraction error:", error);
    return ctx.reply(
      "⚠️ Sorry, I had trouble understanding that. Please try again!"
    );
  }

  // If not an expense, send the AI's reply
  if (!result.is_expense) {
    return ctx.reply(result.reply_message);
  }

  // Save each extracted expense and send confirmation
  for (const exp of result.expenses) {
    // Match the AI-suggested category to user's actual categories
    const matchedCategory = userCategories.find(
      (c) => c.name.toLowerCase() === exp.category.toLowerCase()
    );

    const [saved] = await db
      .insert(expenses)
      .values({
        userId,
        categoryId: matchedCategory?.id ?? null,
        amount: exp.amount.toString(),
        currency: exp.currency,
        description: exp.description,
        sourceType: "text",
        expenseDate: exp.expense_date,
      })
      .returning();

    // Calculate today's running total for this user
    const today = new Date().toISOString().split("T")[0];
    const todayTotal = await db
      .select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), eq(expenses.expenseDate, today)))
      .then((r) => r[0]?.total ?? "0");

    // Inline buttons: Undo (delete) and Change Category
    const keyboard = new InlineKeyboard()
      .text("❌ Undo", `undo:${saved.id}`)
      .text("✏️ Category", `cat:${saved.id}`);

    const categoryEmoji = matchedCategory?.emoji ?? "💸";
    const categoryName = matchedCategory?.name ?? exp.category;

    await ctx.reply(
      `✅ *Logged:* ${Number(exp.amount).toFixed(2)} ${exp.currency} — _${exp.description}_\n` +
        `📁 *Category:* ${categoryEmoji} ${categoryName}\n` +
        `📊 *Spent Today:* ${Number(todayTotal).toFixed(2)} ${user.currency}`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  }
}
