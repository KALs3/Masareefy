import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * /delete_my_data command — lets users permanently erase all their personal data
 * (profile, custom categories, and all expenses via ON DELETE CASCADE).
 */
export async function deleteDataCommand(ctx: CommandContext<Context>) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await db
    .select({ telegramId: users.telegramId })
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return ctx.reply("ℹ️ You don't have any stored data on Masareefy.");
  }

  const keyboard = new InlineKeyboard()
    .text("🗑️ Confirm Delete Everything | تأكيد الحذف", "deldata:confirm")
    .row()
    .text("❌ Cancel | إلغاء", "deldata:cancel");

  await ctx.reply(
    `⚠️ *Delete All My Data | حذف جميع بياناتي*\n\n` +
      `هل أنت متأكد أنك تريد حذف حسابك وجميع مصاريفك وتصنيفاتك نهائياً؟\n` +
      `Are you sure you want to permanently delete your profile, categories, and all logged expenses?\n\n` +
      `• *This action cannot be undone.* (لا يمكن التراجع عن هذا الإجراء)\n` +
      `• Tip: Run /export first if you want a CSV backup.\n` +
      `• Records are deleted immediately from the live database (and aged out of database backups automatically).`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

/**
 * Handles the confirmation / cancellation inline buttons for /delete_my_data.
 */
export async function handleDeleteDataCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  const userId = ctx.from?.id;
  if (!data || !userId) return;

  if (data === "deldata:cancel") {
    await ctx.answerCallbackQuery({ text: "Cancelled" });
    return ctx.editMessageText("✅ *Cancelled.* Your data was not deleted.", {
      parse_mode: "Markdown",
    });
  }

  if (data === "deldata:confirm") {
    // ON DELETE CASCADE on categories and expenses removes all associated rows atomically
    await db.delete(users).where(eq(users.telegramId, userId));
    console.log(`[Privacy] Permanently deleted all data for user=${userId}`);

    await ctx.answerCallbackQuery({ text: "🗑️ Data deleted" });
    return ctx.editMessageText(
      `🗑️ *All your data has been permanently deleted.*\n` +
        `تم حذف حسابك وجميع مصاريفك بنجاح.\n\n` +
        `If you ever wish to use Masareefy again, simply send /start.`,
      { parse_mode: "Markdown" }
    );
  }
}
