import { Bot } from "grammy";
import { getEnv } from "../lib/env";
import { startCommand } from "./commands/start";
import { todayCommand } from "./commands/today";
import { monthCommand } from "./commands/month";
import { exportCommand } from "./commands/export";
import { dashboardCommand } from "./commands/dashboard";
import { helpCommand } from "./commands/help";
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

  // ─── Bot Commands ───────────────────────────────────────────────────────────
  bot.command("start", startCommand);
  bot.command("today", todayCommand);
  bot.command("month", monthCommand);
  bot.command("export", exportCommand);
  bot.command("dashboard", dashboardCommand);
  bot.command("help", helpCommand);

  // ─── Inline Button Callback Queries ─────────────────────────────────────────
  bot.callbackQuery(/^currency:/, handleCurrencySelection);
  bot.callbackQuery(/^undo:/, handleUndo);
  bot.callbackQuery(/^cat:/, handleCategoryChange);
  bot.callbackQuery(/^setcat:/, handleCategorySelect);

  // ─── Multimodal Message Handlers ────────────────────────────────────────────
  // 1. Voice notes and audio files
  bot.on(["message:voice", "message:audio"], handleVoiceMessage);

  // 2. Photos, receipts, and payment screenshots
  bot.on("message:photo", handlePhotoMessage);

  // 3. Natural language text messages
  bot.on("message:text", handleTextMessage);

  // ─── Error Handling ─────────────────────────────────────────────────────────
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  _bot = bot;
  return bot;
}
