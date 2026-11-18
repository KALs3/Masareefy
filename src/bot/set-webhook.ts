import { createBot } from "./index";
import { getEnv } from "../lib/env";

export async function configureWebhook(domainUrl?: string) {
  const env = getEnv();
  const bot = createBot();

  let targetUrl = domainUrl || env.WEBHOOK_URL;
  if (!targetUrl) {
    console.error(
      "❌ Please provide a deployment URL. Usage: npm run webhook:set https://your-app.vercel.app"
    );
    process.exit(1);
  }

  if (!env.WEBHOOK_SECRET_TOKEN) {
    console.error(
      "❌ WEBHOOK_SECRET_TOKEN is not set in .env.local!\n" +
        "   Generate one with: openssl rand -hex 32\n" +
        "   Add it to both .env.local and Vercel Environment Variables before setting the webhook."
    );
    process.exit(1);
  }

  // Ensure url ends with /api/webhook
  targetUrl = targetUrl.replace(/\/+$/, "");
  if (!targetUrl.endsWith("/api/webhook")) {
    targetUrl = `${targetUrl}/api/webhook`;
  }

  console.log(`Setting Telegram webhook to: ${targetUrl} (with secret_token)...`);

  try {
    await bot.api.setWebhook(targetUrl, {
      drop_pending_updates: false,
      secret_token: env.WEBHOOK_SECRET_TOKEN,
    });
    console.log(`✅ Webhook registered successfully with Telegram (secret_token verified)!`);

    const info = await bot.api.getWebhookInfo();
    console.log("Webhook Info:", {
      url: info.url,
      has_custom_certificate: info.has_custom_certificate,
      pending_update_count: info.pending_update_count,
    });
  } catch (error) {
    console.error("Failed to set webhook:", error);
  }
}

const inputUrl = process.argv[2];
configureWebhook(inputUrl).then(() => process.exit(0));
