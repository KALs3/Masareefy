import type { Context } from "grammy";
import { extractExpenseFromImage } from "../../services/ai";
import { db } from "../../db/client";
import { categories, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { saveAndReplyExpenses } from "../utils/expense-logger";
import { checkRateLimit } from "../utils/rate-limiter";
import { downloadTelegramFile } from "../utils/file-downloader";

/**
 * Handles incoming receipt photos, bills, and payment transfer screenshots:
 * 1. Checks user profile
 * 2. Downloads highest-resolution photo directly in-memory
 * 3. Sends image to Gemini for visual receipt & expense extraction
 * 4. Saves and confirms
 */
export async function handlePhotoMessage(ctx: Context) {
  const photos = ctx.message?.photo;
  const userId = ctx.from?.id;
  if (!photos || photos.length === 0 || !userId) return;

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

  // Send photo processing indicator
  await ctx.replyWithChatAction("upload_photo");

  try {
    // Get the highest resolution photo (last element in array)
    const bestPhoto = photos[photos.length - 1];
    if (bestPhoto.file_size !== undefined && bestPhoto.file_size > 10 * 1024 * 1024) {
      return ctx.reply("⚠️ That image is too large (max 10 MB). Please send a smaller photo.");
    }

    const file = await ctx.api.getFile(bestPhoto.file_id);

    if (!file.file_path) {
      console.error(`[Photo] getFile returned no file_path for user ${userId}, file_id: ${bestPhoto.file_id}`);
      return ctx.reply("⚠️ Could not download the image from Telegram. Please try again.");
    }

    console.log(`[Photo] Downloading file: ${file.file_path} (${bestPhoto.width}x${bestPhoto.height}, ~${bestPhoto.file_size || "?"}B) for user ${userId}`);

    const imageBuffer = await downloadTelegramFile(file.file_path);

    if (imageBuffer.length === 0) {
      console.error(`[Photo] Downloaded empty buffer for user ${userId}`);
      return ctx.reply("⚠️ The downloaded image was empty. Please try sending the photo again.");
    }

    console.log(`[Photo] Downloaded ${imageBuffer.length} bytes, sending to Gemini...`);

    // Determine MIME type — Telegram photos are JPEG; documents may vary
    const mimeType = "image/jpeg";

    // Extract caption if the user added one (bounded to 500 chars)
    const caption = ctx.message?.caption
      ? ctx.message.caption.trim().slice(0, 500)
      : undefined;

    const result = await extractExpenseFromImage(
      imageBuffer,
      mimeType,
      user.currency ?? "EGP",
      categoryNames,
      new Date().toISOString().split("T")[0],
      caption
    );

    await saveAndReplyExpenses(ctx, userId, user, userCategories, result, "photo");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Photo] Error for user ${userId}:`, errMsg);

    // Give the user a more specific error message
    if (errMsg.includes("fetch") || errMsg.includes("network") || errMsg.includes("ECONNRESET")) {
      return ctx.reply(
        "⚠️ Network error while downloading the image. Please try sending it again in a few seconds."
      );
    }

    if (errMsg.includes("too large") || errMsg.includes("exceeds") || errMsg.includes("size")) {
      return ctx.reply(
        "⚠️ That image is too large. Please try sending a smaller or more compressed photo."
      );
    }

    return ctx.reply(
      "⚠️ Sorry, I had trouble scanning that receipt. Tips:\n" +
        "• Make sure the receipt is clear and well-lit\n" +
        "• Try cropping to show just the receipt\n" +
        "• You can also type the expense manually (e.g., `150 coffee`)"
    );
  }
}
