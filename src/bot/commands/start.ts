import { CommandContext, InlineKeyboard } from "grammy";
import type { Context } from "grammy";
import { db } from "../../db/client";
import { users, categories } from "../../db/schema";

const DEFAULT_CATEGORIES = [
  { name: "Food & Dining", emoji: "🍕" },
  { name: "Transport", emoji: "🚗" },
  { name: "Groceries", emoji: "🛒" },
  { name: "Bills & Utilities", emoji: "💡" },
  { name: "Shopping", emoji: "🛍️" },
  { name: "Entertainment", emoji: "🎬" },
  { name: "Health", emoji: "💊" },
  { name: "Other", emoji: "💸" },
];

/**
 * /start command — onboards a new user:
 * 1. Upserts the user record
 * 2. Seeds default expense categories
 * 3. Prompts for default currency selection
 */
export async function startCommand(ctx: CommandContext<Context>) {
  const telegramUser = ctx.from!;

  // Upsert user — create if new, update username if returning
  await db
    .insert(users)
    .values({
      telegramId: telegramUser.id,
      username: telegramUser.username ?? null,
      firstName: telegramUser.first_name,
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        username: telegramUser.username ?? null,
        firstName: telegramUser.first_name,
      },
    });

  // Seed default categories (skip if they already exist)
  for (const cat of DEFAULT_CATEGORIES) {
    await db
      .insert(categories)
      .values({
        userId: telegramUser.id,
        name: cat.name,
        emoji: cat.emoji,
      })
      .onConflictDoNothing();
  }

  // Currency selection inline keyboard
  const keyboard = new InlineKeyboard()
    .text("🇪🇬 EGP", "currency:EGP")
    .text("🇺🇸 USD", "currency:USD")
    .row()
    .text("🇪🇺 EUR", "currency:EUR")
    .text("🇸🇦 SAR", "currency:SAR")
    .row()
    .text("🇦🇪 AED", "currency:AED");

  await ctx.reply(
    `👋 Welcome, ${telegramUser.first_name}!\n\n` +
      `I'm your personal expense tracker. Just send me a message like:\n` +
      `💬 "150 coffee and croissant"\n` +
      `💬 "Paid 50 for uber yesterday"\n\n` +
      `First, pick your default currency:`,
    { reply_markup: keyboard }
  );
}
