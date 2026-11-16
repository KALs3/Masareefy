import type { Context } from "grammy";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Handles currency selection from the /start onboarding keyboard.
 * Callback data format: "currency:EGP"
 */
export async function handleCurrencySelection(ctx: Context) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const currency = data.split(":")[1];
  const userId = ctx.from?.id;
  if (!currency || !userId) return;

  // Update user's default currency
  await db
    .update(users)
    .set({ currency })
    .where(eq(users.telegramId, userId));

  await ctx.answerCallbackQuery({
    text: `✅ Currency set to ${currency}`,
  });

  await ctx.editMessageText(
    `✅ Currency set to *${currency}*\\!\n\n` +
      `You're all set\\! Now just send me your expenses like:\n` +
      `💬 "150 coffee and croissant"\n` +
      `💬 "Paid 300 for groceries"\n` +
      `💬 "50 uber yesterday"`,
    { parse_mode: "MarkdownV2" }
  );
}
