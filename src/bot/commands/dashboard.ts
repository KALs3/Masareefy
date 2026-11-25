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
    (env.WEBHOOK_URL ? env.WEBHOOK_URL.replace("/api/webhook", "") : "");

  const keyboard = new InlineKeyboard();

  if (webAppUrl && webAppUrl.startsWith("https://")) {
    keyboard.webApp("📈 فتح لوحة التحكم | Open Dashboard", webAppUrl);
  } else if (ctx.me?.username) {
    keyboard.url(
      "📈 فتح البوت | Open Bot",
      `https://t.me/${ctx.me.username}`
    );
  }

  await ctx.reply(
    `📱 *لوحة تحكم مصاريفي | Masareefy Mini App*\n\n` +
      `افتح التطبيق التفاعلي لمتابعة تحليلات المصاريف، الرسوم البيانية، ونسبة استهلاك الميزانية الشهرية.\n\n` +
      `اضغط على الزر بالأسفل للفتح:`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}
