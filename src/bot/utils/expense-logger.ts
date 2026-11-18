import crypto from "node:crypto";
import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import type { ExtractionResult } from "../../services/ai";
import { encryptField, decryptField } from "../../lib/encryption";

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
    // Sanity-bound amount to match numeric(12, 2) and prevent DB overflow
    if (!Number.isFinite(exp.amount) || exp.amount <= 0 || exp.amount > 999_999_999.99) {
      continue;
    }

    const cleanDescription = (exp.description || "Expense").trim().slice(0, 255);

    // Find matching category (case-insensitive)
    const matchedCategory = userCategories.find(
      (c) => c.name.toLowerCase() === exp.category.toLowerCase()
    );

    // Deduplication guard: prevent identical expense inserts within 20 seconds (fixes Telegram webhook retries)
    const twentySecondsAgo = new Date(Date.now() - 20 * 1000);
    const recentExpenses = await db
      .select({ id: expenses.id, description: expenses.description })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.amount, exp.amount.toFixed(2)),
          gte(expenses.createdAt, twentySecondsAgo)
        )
      )
      .limit(5);

    const isDuplicate = recentExpenses.some(
      (r) =>
        decryptField(r.description, {
          userId,
          recordId: r.id,
          field: "description",
        }) === cleanDescription
    );

    if (isDuplicate) {
      console.log(`[Dedupe] Skipped duplicate webhook insert for user=${userId}`);
      continue;
    }

    // Pre-generate UUID so AAD cryptographically binds (userId, recordId, field)
    const expenseId = crypto.randomUUID();
    const encryptedDescription = encryptField(cleanDescription, {
      userId,
      recordId: expenseId,
      field: "description",
    });

    const [saved] = await db
      .insert(expenses)
      .values({
        id: expenseId,
        userId,
        categoryId: matchedCategory?.id ?? null,
        amount: exp.amount.toFixed(2),
        currency: (exp.currency || user.currency || "EGP").slice(0, 10),
        description: encryptedDescription,
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
