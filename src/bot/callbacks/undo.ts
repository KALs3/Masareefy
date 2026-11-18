import type { Context } from "grammy";
import { db } from "../../db/client";
import { expenses } from "../../db/schema";
import { eq, and } from "drizzle-orm";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Handles the "❌ Undo" inline button — deletes the expense strictly scoped to the owner.
 * Callback data format: "undo:<expense-uuid>"
 */
export async function handleUndo(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const expenseId = data.split(":")[1];
  const userId = ctx.from?.id;
  if (!expenseId || !userId || !UUID_REGEX.test(expenseId)) {
    return ctx.answerCallbackQuery({ text: "⚠️ Invalid request" });
  }

  // Strictly scope DELETE by both expenseId AND userId to prevent IDOR
  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });

  if (deleted.length === 0) {
    return ctx.answerCallbackQuery({ text: "⚠️ Expense not found" });
  }

  await ctx.answerCallbackQuery({ text: "🗑️ Expense deleted" });

  await ctx.editMessageText("🗑️ _Expense deleted_", {
    parse_mode: "Markdown",
  });
}
