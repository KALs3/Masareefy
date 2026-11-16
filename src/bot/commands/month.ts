import type { CommandContext, Context } from "grammy";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

function renderProgressBar(percentage: number, length: number = 8): string {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const filled = Math.round((clamped / 100) * length);
  const empty = length - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

/**
 * /month command — breakdown of current month's expenses by category with progress bars.
 */
export async function monthCommand(ctx: CommandContext<Context>) {
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

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const monthName = now.toLocaleString("default", { month: "long" });

  const firstDay = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).toISOString().split("T")[0];

  // Query expenses for current month
  const monthExpenses = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      currency: expenses.currency,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categoryId: expenses.categoryId,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, firstDay),
        lte(expenses.expenseDate, lastDay)
      )
    );

  if (monthExpenses.length === 0) {
    return ctx.reply(
      `📊 *${monthName} ${year} Summary*\n\n` +
        `✨ No expenses recorded yet for this month!`,
      { parse_mode: "Markdown" }
    );
  }

  const totalSpent = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Group by category
  const categoryMap = new Map<
    string,
    { name: string; emoji: string; total: number }
  >();

  for (const exp of monthExpenses) {
    const key = exp.categoryId || "uncategorized";
    const existing = categoryMap.get(key);
    const amount = Number(exp.amount);

    if (existing) {
      existing.total += amount;
    } else {
      categoryMap.set(key, {
        name: exp.categoryName || "Other",
        emoji: exp.categoryEmoji || "💸",
        total: amount,
      });
    }
  }

  // Sort categories by total descending
  const sortedCategories = Array.from(categoryMap.values()).sort(
    (a, b) => b.total - a.total
  );

  let message = `📊 *${monthName} ${year} Spending*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // List each category with progress bar
  for (const cat of sortedCategories) {
    const pct = totalSpent > 0 ? (cat.total / totalSpent) * 100 : 0;
    const bar = renderProgressBar(pct, 8);
    message += `${cat.emoji} *${cat.name}*\n`;
    message += `${bar} ${pct.toFixed(0)}% — *${cat.total.toFixed(2)} ${user.currency}*\n\n`;
  }

  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💰 *Total Spent:* ${totalSpent.toFixed(2)} ${user.currency}\n`;

  // Budget status if user set a monthly budget
  const monthlyBudget = Number(user.monthlyBudget || 0);
  if (monthlyBudget > 0) {
    const budgetPct = (totalSpent / monthlyBudget) * 100;
    const budgetBar = renderProgressBar(budgetPct, 10);
    const remaining = monthlyBudget - totalSpent;

    message += `🎯 *Budget:* ${monthlyBudget.toFixed(2)} ${user.currency}\n`;
    message += `📈 [${budgetBar}] ${budgetPct.toFixed(0)}%\n`;

    if (remaining > 0) {
      message += `🟢 *Remaining:* ${remaining.toFixed(2)} ${user.currency}`;
    } else {
      message += `🔴 *Over Budget by:* ${Math.abs(remaining).toFixed(2)} ${user.currency}!`;
    }
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
}
