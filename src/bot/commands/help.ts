import type { CommandContext, Context } from "grammy";

/**
 * /help command — lists all available bot commands and input methods.
 */
export async function helpCommand(ctx: CommandContext<Context>) {
  const helpText =
    `💡 *Masareefy Bot Commands & Tips*\n\n` +
    `*Commands:*\n` +
    `• /start — Onboarding & default currency setup\n` +
    `• /today — Breakdown of today's expenses\n` +
    `• /month — Monthly category breakdown with progress bars\n` +
    `• /export — Download all transactions as a CSV file\n` +
    `• /dashboard — Open the Mini App web analytics\n` +
    `• /help — Show this help menu\n\n` +
    `*How to Log Expenses:*\n` +
    `💬 *Text:* Send messages like \`150 coffee\` or \`Paid 300 for groceries\`\n` +
    `🎙️ *Voice Note:* Send a voice message in English or Arabic (e.g., "دفعت 80 جنيه في الصيدلية")\n` +
    `🧾 *Receipt / Photo:* Send a photo of a receipt or InstaPay / banking screenshot\n\n` +
    `*Actions:*\n` +
    `Under every logged expense, click *[❌ Undo]* to delete or *[✏️ Category]* to reassign.`;

  await ctx.reply(helpText, { parse_mode: "Markdown" });
}
