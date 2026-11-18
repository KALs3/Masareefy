import { Bot } from "grammy";
import { getEnv } from "../lib/env";
import { startCommand } from "./commands/start";
import { todayCommand } from "./commands/today";
import { monthCommand } from "./commands/month";
import { exportCommand } from "./commands/export";
import { dashboardCommand } from "./commands/dashboard";
import { helpCommand } from "./commands/help";
import {
  deleteDataCommand,
  handleDeleteDataCallback,
} from "./commands/delete-data";
import { handleCurrencySelection } from "./callbacks/currency";
import { handleUndo } from "./callbacks/undo";
import { handleCategoryChange, handleCategorySelect } from "./callbacks/category";
import { handleTextMessage } from "./handlers/text";
import { handleVoiceMessage } from "./handlers/voice";
import { handlePhotoMessage } from "./handlers/photo";

let _bot: Bot | null = null;

/**
 * Create and configure the grammY bot instance.
 * Singleton pattern avoids duplicate bot instances in serverless environments.
 */
export function createBot(): Bot {
  if (_bot) return _bot;

  const bot = new Bot(getEnv().TELEGRAM_BOT_TOKEN);

  // ─── 1. Privacy-Safe Request Logger (NEVER logs message text, amounts, or data) ─
  bot.use(async (ctx, next) => {
    const type = ctx.message?.text
      ? ctx.message.text.startsWith("/")
        ? "command"
        : "text"
      : ctx.message?.photo
      ? "photo"
      : ctx.message?.voice || ctx.message?.audio
      ? "voice"
      : ctx.callbackQuery
      ? "callback"
      : Object.keys(ctx.update).find((k) => k !== "update_id") || "update";

    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    // Log only safe metadata (type, user ID, timing) — zero plaintext content
    console.log(
      `[Bot] type=${type} user=${ctx.from?.id ?? "unknown"} chat=${ctx.chat?.type ?? "unknown"} duration=${duration}ms`
    );
  });

  // ─── 2. Restrict Bot to Private Chats Only (prevents financial leaks in groups) ─
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private") {
      // Only reply if directly invoking a command in a group; silently ignore general group chatter
      if (ctx.message?.text?.startsWith("/")) {
        await ctx.reply(
          "🔒 For your privacy, Masareefy only works in private 1-on-1 chats. Please message me directly!"
        );
      }
      return;
    }
    await next();
  });

  // ─── Bot Commands ───────────────────────────────────────────────────────────
  bot.command("start", startCommand);
  bot.command("today", todayCommand);
  bot.command("month", monthCommand);
  bot.command("export", exportCommand);
  bot.command("dashboard", dashboardCommand);
  bot.command("help", helpCommand);
  bot.command("delete_my_data", deleteDataCommand);

  // ─── Inline Button Callback Queries ─────────────────────────────────────────
  bot.callbackQuery(/^currency:/, handleCurrencySelection);
  bot.callbackQuery(/^undo:/, handleUndo);
  bot.callbackQuery(/^cat:/, handleCategoryChange);
  bot.callbackQuery(/^setcat:/, handleCategorySelect);
  bot.callbackQuery(/^deldata:/, handleDeleteDataCallback);

  // ─── Multimodal Message Handlers ────────────────────────────────────────────
  // 1. Voice notes and audio files
  bot.on(["message:voice", "message:audio"], handleVoiceMessage);

  // 2. Photos, receipts, and payment screenshots
  bot.on("message:photo", handlePhotoMessage);

  // 3. Natural language text messages
  bot.on("message:text", handleTextMessage);

  // ─── Error Handling (log error name/message safely without context dump) ────
  bot.catch((err) => {
    const msg = err.error instanceof Error ? err.error.message : "Unknown error";
    console.error(`[Bot] Handler error (update_id=${err.ctx.update.update_id}): ${msg}`);
  });

  _bot = bot;
  return bot;
}
