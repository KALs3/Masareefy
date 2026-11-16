import type { Context } from "grammy";
import { db } from "../../db/client";
import { expenses } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Handles the "❌ Undo" inline button — deletes the expense.
 * Callback data format: "undo:<expense-uuid>"
 */
export async function handleUndo(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const expenseId = data.split(":")[1];
  const userId = ctx.from?.id;
  if (!expenseId || !userId) return;

  // Delete the expense (only if it belongs to this user)
  const deleted = await db
    .delete(expenses)
    .where(eq(expenses.id, expenseId))
    .returning();

  if (deleted.length === 0 || deleted[0].userId !== userId) {
    return ctx.answerCallbackQuery({ text: "⚠️ Expense not found" });
  }

  await ctx.answerCallbackQuery({ text: "🗑️ Expense deleted" });

  await ctx.editMessageText("🗑️ _Expense deleted_", {
    parse_mode: "Markdown",
  });
}
