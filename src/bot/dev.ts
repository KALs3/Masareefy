import { createBot } from "./index";
import { registerBotCommands } from "./setup-commands";

const bot = createBot();

console.log("\n=======================================================");
console.log("🛠️  Starting Masareefy in LOCAL DEV MODE (Long Polling)");
console.log("=======================================================");

bot.start({
  drop_pending_updates: true,
  onStart: async (info) => {
    console.log(`\n🚀 Bot @${info.username} is live and connected directly to your terminal!`);
    console.log(`📡 All requests, AI extractions, and timings will appear below in real-time.`);
    console.log(`🛑 Press Ctrl+C at any time to stop.\n`);
    await registerBotCommands();
  },
});

// Graceful exit
const cleanup = async () => {
  console.log("\n\n🛑 Stopping local dev bot...");
  await bot.stop();
  console.log("\n💡 To switch back to your production Vercel deployment, run:");
  console.log("   npm run webhook:set https://masareefy-chi.vercel.app\n");
  process.exit(0);
};

process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);
