import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { ExtractionResult } from "../../services/ai";

/**
 * Common handler to save extracted expenses and reply with confirmation buttons and budget alerts.
 */
export async function saveAndReplyExpenses(
  ctx: Context,
  userId: number,
  user: typeof users.$inferSelect,
  userCategories: (typeof categories.$inferSelect)[],
  result: ExtractionResult,
  sourceType: "text" | "voice" | "photo"
) {
  if (!result.is_expense || result.expenses.length === 0) {
    return ctx.reply(
      result.reply_message || "I couldn't find any expense details in that message."
    );
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const firstDayOfMonth = `${year}-${month}-01`;
  const lastDayOfMonth = new Date(year, now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  for (const exp of result.expenses) {
    // Find matching category (case-insensitive)
    const matchedCategory = userCategories.find(
      (c) => c.name.toLowerCase() === exp.category.toLowerCase()
    );

    const [saved] = await db
      .insert(expenses)
      .values({
        userId,
        categoryId: matchedCategory?.id ?? null,
        amount: exp.amount.toString(),
        currency: exp.currency || user.currency || "EGP",
        description: exp.description || "Expense",
        sourceType,
        expenseDate: exp.expense_date || now.toISOString().split("T")[0],
      })
      .returning();

    // 1. Calculate today's running total for this user
    const today = now.toISOString().split("T")[0];
    const todayTotal = await db
      .select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(and(eq(expenses.userId, userId), eq(expenses.expenseDate, today)))
      .then((r) => r[0]?.total ?? "0");

    // 2. Check monthly budget alerts
    let budgetAlertText = "";
    const monthlyBudget = Number(user.monthlyBudget || 0);

    if (monthlyBudget > 0) {
      const monthTotal = await db
        .select({
          total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            gte(expenses.expenseDate, firstDayOfMonth),
            lte(expenses.expenseDate, lastDayOfMonth)
          )
        )
        .then((r) => Number(r[0]?.total || 0));

      const percentage = (monthTotal / monthlyBudget) * 100;

      if (percentage >= 100) {
        const overAmount = monthTotal - monthlyBudget;
        budgetAlertText =
          `\n\n🚨 *BUDGET EXCEEDED!* (${percentage.toFixed(0)}%)\n` +
          `You've exceeded your monthly limit by *${overAmount.toFixed(2)} ${user.currency}*!`;
      } else if (percentage >= 80) {
        const remaining = monthlyBudget - monthTotal;
        budgetAlertText =
          `\n\n⚠️ *BUDGET WARNING!* (${percentage.toFixed(0)}%)\n` +
          `You've used ${percentage.toFixed(0)}% of your monthly budget. *${remaining.toFixed(2)} ${user.currency}* remaining.`;
      }
    }

    // Inline buttons: Undo and Change Category
    const keyboard = new InlineKeyboard()
      .text("❌ Undo", `undo:${saved.id}`)
      .text("✏️ Category", `cat:${saved.id}`);

    const categoryEmoji = matchedCategory?.emoji ?? "💸";
    const categoryName = matchedCategory?.name ?? exp.category;
    const sourceIcon =
      sourceType === "voice" ? "🎙️" : sourceType === "photo" ? "🧾" : "💬";

    await ctx.reply(
      `✅ *Logged:* ${Number(exp.amount).toFixed(2)} ${exp.currency} — _${exp.description}_\n` +
        `📁 *Category:* ${categoryEmoji} ${categoryName}\n` +
        `📊 *Spent Today:* ${Number(todayTotal).toFixed(2)} ${user.currency}\n` +
        `🏷️ *Source:* ${sourceIcon} ${sourceType}${budgetAlertText}`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  }
}
