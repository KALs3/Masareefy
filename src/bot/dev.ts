import { createBot } from "./index";

const bot = createBot();

console.log("Starting bot in long-polling mode for local development...");

bot.start({
  onStart: (info) => {
    console.log(`🚀 Bot @${info.username} is live and listening for messages!`);
    console.log("Press Ctrl+C to stop.");
  },
});
