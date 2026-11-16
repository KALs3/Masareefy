import { Bot } from "grammy";
import { getEnv } from "../lib/env";
import { startCommand } from "./commands/start";
import { handleCurrencySelection } from "./callbacks/currency";
import { handleUndo } from "./callbacks/undo";
import { handleCategoryChange, handleCategorySelect } from "./callbacks/category";
import { handleTextMessage } from "./handlers/text";

let _bot: Bot | null = null;

/**
 * Create and configure the grammY bot instance.
 * Uses a singleton to avoid creating multiple bot instances in serverless.
 */
export function createBot(): Bot {
  if (_bot) return _bot;

  const bot = new Bot(getEnv().TELEGRAM_BOT_TOKEN);

  // ─── Commands ───────────────────────────────────────────────────────
  bot.command("start", startCommand);

  // ─── Callback Queries (inline button presses) ──────────────────────
  bot.callbackQuery(/^currency:/, handleCurrencySelection);
  bot.callbackQuery(/^undo:/, handleUndo);
  bot.callbackQuery(/^cat:/, handleCategoryChange);
  bot.callbackQuery(/^setcat:/, handleCategorySelect);

  // ─── Message Handlers ──────────────────────────────────────────────
  // Text messages → AI extraction pipeline
  bot.on("message:text", handleTextMessage);

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  _bot = bot;
  return bot;
}
