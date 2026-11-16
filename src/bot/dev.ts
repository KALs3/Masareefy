import { createBot } from "./index";
import { registerBotCommands } from "./setup-commands";

const bot = createBot();

console.log("Starting bot in long-polling mode for local development...");

bot.start({
  onStart: async (info) => {
    console.log(`🚀 Bot @${info.username} is live and listening for messages!`);
    await registerBotCommands();
    console.log("Press Ctrl+C to stop.");
  },
});
