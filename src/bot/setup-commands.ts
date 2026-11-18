import { createBot } from "./index";

// Default bilingual command menu
export const BOT_COMMANDS = [
  { command: "today", description: "📅 مصاريف اليوم | Today's spending" },
  { command: "month", description: "📊 تقرير الشهر والميزانية | Monthly summary" },
  { command: "dashboard", description: "📈 لوحة التحكم | Open Mini App" },
  { command: "export", description: "📁 تصدير إكسيل | Export CSV" },
  { command: "help", description: "💡 المساعدة وكيفية الاستخدام | Help & Guide" },
  { command: "start", description: "⚙️ ضبط الحساب والعملة | Settings" },
  { command: "delete_my_data", description: "🗑️ حذف جميع بياناتي | Delete all my data" },
];

// Dedicated Arabic command menu for Arabic Telegram clients
export const BOT_COMMANDS_AR = [
  { command: "today", description: "📅 ملخص وتفاصيل مصاريف اليوم" },
  { command: "month", description: "📊 تقرير الشهر ونسبة الميزانية" },
  { command: "dashboard", description: "📈 فتح لوحة التحكم التفاعلية" },
  { command: "export", description: "📁 تحميل تقرير المصاريف (CSV)" },
  { command: "help", description: "💡 المساعدة وطريقة تسجيل المصاريف" },
  { command: "start", description: "⚙️ إعداد الحساب وتغيير العملة" },
  { command: "delete_my_data", description: "🗑️ حذف حسابي وجميع بياناتي نهائياً" },
];

export async function registerBotCommands() {
  const bot = createBot();
  try {
    // 1. Set general/default commands
    await bot.api.setMyCommands(BOT_COMMANDS);

    // 2. Set specialized Arabic menu for users with Arabic Telegram language
    await bot.api.setMyCommands(BOT_COMMANDS_AR, { language_code: "ar" });

    console.log("✅ Registered Telegram bot command menus (Default & Arabic) successfully!");
  } catch (error) {
    console.error("Failed to register bot commands:", error);
  }
}

// Run directly if invoked as standalone script
if (process.argv[1]?.includes("setup-commands")) {
  registerBotCommands().then(() => process.exit(0));
}
