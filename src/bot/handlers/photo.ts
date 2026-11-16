import type { Context } from "grammy";
import { extractExpenseFromImage } from "../../services/ai";
import { db } from "../../db/client";
import { categories, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { getEnv } from "../../lib/env";
import { saveAndReplyExpenses } from "../utils/expense-logger";
import { checkRateLimit } from "../utils/rate-limiter";

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
    const file = await ctx.getFile();
    if (!file.file_path) {
      return ctx.reply("⚠️ Could not download receipt image. Please try again.");
    }

    const token = getEnv().TELEGRAM_BOT_TOKEN;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch photo from Telegram: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    // Telegram photos are JPEG format
    const mimeType = "image/jpeg";

    const result = await extractExpenseFromImage(
      imageBuffer,
      mimeType,
      user.currency ?? "EGP",
      categoryNames,
      new Date().toISOString().split("T")[0]
    );

    await saveAndReplyExpenses(ctx, userId, user, userCategories, result, "photo");
  } catch (error) {
    console.error("Photo expense error:", error);
    return ctx.reply(
      "⚠️ Sorry, I had trouble scanning that receipt. Please ensure the receipt is clear and well-lit, or type it manually!"
    );
  }
}
