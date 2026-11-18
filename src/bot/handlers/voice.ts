import type { Context } from "grammy";
import { extractExpenseFromAudio } from "../../services/ai";
import { db } from "../../db/client";
import { categories, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { saveAndReplyExpenses } from "../utils/expense-logger";
import { checkRateLimit } from "../utils/rate-limiter";
import { downloadTelegramFile } from "../utils/file-downloader";

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

  // Reject very short voice notes (< 1 second) — they're usually accidental
  if (voice.duration !== undefined && voice.duration < 1) {
    return ctx.reply(
      "⚠️ That voice note was too short. Please record a longer message describing your expense."
    );
  }

  // Fetch user's categories for the AI prompt
  const userCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId));

  const categoryNames = userCategories.map((c) => c.name);

  // Send voice listening / typing indicator
  await ctx.replyWithChatAction("typing");

  try {
    // Retrieve file info from Telegram
    const file = await ctx.api.getFile(voice.file_id);

    if (!file.file_path) {
      console.error(`[Voice] getFile returned no file_path for user ${userId}, file_id: ${voice.file_id}`);
      return ctx.reply("⚠️ Could not download the voice message. Please try again.");
    }

    console.log(
      `[Voice] Downloading: ${file.file_path} (duration: ${voice.duration}s, ~${voice.file_size || "?"}B, mime: ${voice.mime_type || "unknown"}) for user ${userId}`
    );

    const audioBuffer = await downloadTelegramFile(file.file_path);

    if (audioBuffer.length === 0) {
      console.error(`[Voice] Downloaded empty buffer for user ${userId}`);
      return ctx.reply("⚠️ The downloaded voice note was empty. Please try recording again.");
    }

    console.log(`[Voice] Downloaded ${audioBuffer.length} bytes, sending to Gemini...`);

    const result = await extractExpenseFromAudio(
      audioBuffer,
      voice.mime_type || "audio/ogg",
      user.currency ?? "EGP",
      categoryNames,
      new Date().toISOString().split("T")[0]
    );

    await saveAndReplyExpenses(ctx, userId, user, userCategories, result, "voice");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Voice] Error for user ${userId}:`, errMsg);

    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("ECONNRESET")) {
      return ctx.reply(
        "⚠️ Network error while downloading the voice note. Please try again in a few seconds."
      );
    }

    return ctx.reply(
      "⚠️ Sorry, I had trouble processing that voice note. Tips:\n" +
        "• Speak clearly and mention the amount and what you bought\n" +
        "• Try a slightly longer recording (2+ seconds)\n" +
        "• You can also type it: `150 coffee`"
    );
  }
}
