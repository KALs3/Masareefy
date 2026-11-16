import { createBot } from "./index";

export const BOT_COMMANDS = [
  { command: "start", description: "👋 Onboarding & choose default currency" },
  { command: "today", description: "📅 Today's itemized spending summary" },
  { command: "month", description: "📊 Monthly category breakdown & progress bars" },
  { command: "dashboard", description: "📈 Launch interactive Web Mini App" },
  { command: "export", description: "📁 Download your transactions spreadsheet (.csv)" },
  { command: "help", description: "💡 Help & how to log expenses" },
];

export async function registerBotCommands() {
  const bot = createBot();
  try {
    await bot.api.setMyCommands(BOT_COMMANDS);
    console.log("✅ Registered Telegram bot command menu successfully!");
  } catch (error) {
    console.error("Failed to register bot commands:", error);
  }
}

// Run directly if invoked as standalone script
if (process.argv[1]?.includes("setup-commands")) {
  registerBotCommands().then(() => process.exit(0));
}
