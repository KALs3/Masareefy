import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { getEnv } from "../../lib/env";

/**
 * /dashboard command — sends an inline button to launch the Web Mini App dashboard.
 */
export async function dashboardCommand(ctx: CommandContext<Context>) {
  const env = getEnv();
  const webAppUrl =
    env.MINI_APP_URL ||
    (env.WEBHOOK_URL ? env.WEBHOOK_URL.replace("/api/webhook", "") : "") ||
    "https://masareefy-chi.vercel.app";

  const keyboard = new InlineKeyboard();

  if (webAppUrl && webAppUrl.startsWith("https://")) {
    keyboard.webApp("📈 Open Mini App Dashboard", webAppUrl);
  } else {
    keyboard.url(
      "📈 Open Bot on Telegram",
      "https://t.me/Masareefyy_bot"
    );
  }

  await ctx.reply(
    `📱 *Masareefy Mini App Dashboard*\n\n` +
      `View your interactive spending analytics, monthly breakdown charts, category donuts, and transaction history.\n\n` +
      `Click the button below to launch:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}
