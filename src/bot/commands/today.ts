import type { CommandContext, Context } from "grammy";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { decryptText } from "../../lib/encryption";

/**
 * /today command — displays an itemized list and total of today's expenses.
 */
export async function todayCommand(ctx: CommandContext<Context>) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return ctx.reply("👋 Please run /start first to set up your account!");
  }

  const today = new Date().toISOString().split("T")[0];

  // Query today's expenses joined with categories
  const todayExpenses = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      currency: expenses.currency,
      description: expenses.description,
      sourceType: expenses.sourceType,
      createdAt: expenses.createdAt,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(and(eq(expenses.userId, userId), eq(expenses.expenseDate, today)))
    .orderBy(desc(expenses.createdAt));

  if (todayExpenses.length === 0) {
    return ctx.reply(
      `📅 *Today's Expenses* (${today})\n\n` +
        `✨ No expenses logged yet today!\n` +
        `Send a text, voice note, or receipt photo to log one.`,
      { parse_mode: "Markdown" }
    );
  }

  const total = todayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  let message = `📅 *Today's Expenses* (${today})\n\n`;

  for (const exp of todayExpenses) {
    const emoji = exp.categoryEmoji || "💸";
    const src = exp.sourceType === "voice" ? "🎙️" : exp.sourceType === "photo" ? "🧾" : "💬";
    const decryptedDesc = decryptText(exp.description, userId);
    message += `• ${emoji} *${Number(exp.amount).toFixed(2)} ${exp.currency}* — _${decryptedDesc}_ (${src})\n`;
  }

  message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 *Total Spent Today:* ${total.toFixed(2)} ${user.currency}`;

  await ctx.reply(message, { parse_mode: "Markdown" });
}
