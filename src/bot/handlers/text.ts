import type { Context } from "grammy";
import { extractExpenseFromText } from "../../services/ai";
import { db } from "../../db/client";
import { categories, users } from "../../db/schema";
import { eq } from "drizzle-orm";
import { saveAndReplyExpenses } from "../utils/expense-logger";
import { checkRateLimit } from "../utils/rate-limiter";

/**
 * Handles incoming text messages:
 * 1. Checks user profile
 * 2. Runs text through Gemini extraction
 * 3. Saves and confirms
 */
export async function handleTextMessage(ctx: Context) {
  const text = ctx.message?.text;
  const userId = ctx.from?.id;
  if (!text || !userId) return;

  // Skip slash commands
  if (text.startsWith("/")) return;

  // Enforce max message size to prevent LLM token stuffing / abuse
  if (text.length > 1000) {
    return ctx.reply(
      "⚠️ That message is too long (max 1000 characters). Please send a shorter expense description."
    );
  }

  const isDev = process.env.NODE_ENV !== "production";
  const tStart = Date.now();
  if (isDev) console.log(`[Text] 1. Looking up user & categories for user=${userId}...`);

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
  if (isDev) console.log(`[Text] 1. DB Lookup finished in ${Date.now() - tStart}ms`);

  // Send typing indicator
  await ctx.replyWithChatAction("typing");

  try {
    const tAi = Date.now();
    if (isDev) console.log(`[Text] 2. Extracting expense with AI...`);
    const result = await extractExpenseFromText(
      text,
      user.currency ?? "EGP",
      categoryNames,
      new Date().toISOString().split("T")[0]
    );
    if (isDev) console.log(`[Text] 2. AI Extraction finished in ${Date.now() - tAi}ms`);

    const tSave = Date.now();
    if (isDev) console.log(`[Text] 3. Saving expense and sending confirmation...`);
    await saveAndReplyExpenses(ctx, userId, user, userCategories, result, "text");
    if (isDev) console.log(`[Text] 3. Save & Reply finished in ${Date.now() - tSave}ms`);
  } catch (error) {
    console.error("Text expense error:", error);
    return ctx.reply(
      "⚠️ Sorry, I had trouble processing that expense. Please try again!"
    );
  }
}
