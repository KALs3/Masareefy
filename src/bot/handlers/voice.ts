import type { Context } from "grammy";
import { extractExpenseFromAudio } from "../../services/ai";
import { db } from "../../db/client";
import { categories, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { getEnv } from "../../lib/env";
import { saveAndReplyExpenses } from "../utils/expense-logger";
import { checkRateLimit } from "../utils/rate-limiter";

/**
 * Handles incoming voice notes:
 * 1. Checks user profile
 * 2. Downloads audio bytes directly in-memory from Telegram
 * 3. Sends audio to Gemini for speech-to-expense extraction
 * 4. Saves and confirms
 */
export async function handleVoiceMessage(ctx: Context) {
  const voice = ctx.message?.voice || ctx.message?.audio;
  const userId = ctx.from?.id;
  if (!voice || !userId) return;

  // Fetch user record
  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return ctx.reply("👋 Please run /start first to set up your account!");
  }

  // Rate limit protection
  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(rateCheck.reason || "Rate limit reached.", {
      parse_mode: "Markdown",
    });
  }

  // Fetch user's categories for the AI prompt
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryNames = userCategories.map((c) => c.name);

  // Send voice listening / typing indicator
  await ctx.replyWithChatAction("record_voice");

  try {
    // Retrieve file info from Telegram
    const file = await ctx.getFile();
    if (!file.file_path) {
      return ctx.reply("⚠️ Could not download voice message. Please try again.");
    }

    const token = getEnv().TELEGRAM_BOT_TOKEN;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from Telegram: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    const result = await extractExpenseFromAudio(
      audioBuffer,
      voice.mime_type || "audio/ogg",
      user.currency ?? "EGP",
      categoryNames,
      new Date().toISOString().split("T")[0]
    );

    await saveAndReplyExpenses(ctx, userId, user, userCategories, result, "voice");
  } catch (error) {
    console.error("Voice expense error:", error);
    return ctx.reply(
      "⚠️ Sorry, I had trouble processing that voice note. Please try speaking clearly or send as text!"
    );
  }
}
