import { db } from "../../db/client";
import { expenses } from "../../db/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Configuration ────────────────────────────────────────────────────────────
export const RATE_LIMITS = {
  MAX_REQUESTS_PER_MINUTE: 5,   // Burst limit per user
  MAX_EXPENSES_PER_DAY: 35,     // Daily limit per user
};

// In-memory sliding window cache for burst protection (survives warm lambdas)
const userRequestTimestamps = new Map<number, number[]>();

/**
 * Checks if a user is exceeding the rate limits:
 * 1. Burst limit: Max 5 requests in any rolling 60-second window.
 * 2. Daily limit: Max 35 logged expenses on the current calendar day.
 *
 * Returns { allowed: boolean, reason?: string }
 */
export async function checkRateLimit(
  userId: number
): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  // ─── 1. In-memory burst limit check ─────────────────────────────────────────
  const timestamps = userRequestTimestamps.get(userId) || [];
  // Keep only timestamps from the last 60 seconds
  const recentTimestamps = timestamps.filter((t) => t > oneMinuteAgo);

  if (recentTimestamps.length >= RATE_LIMITS.MAX_REQUESTS_PER_MINUTE) {
    userRequestTimestamps.set(userId, recentTimestamps);
    return {
      allowed: false,
      reason: `⏳ *Whoa, slow down!* You can only send up to ${RATE_LIMITS.MAX_REQUESTS_PER_MINUTE} messages per minute. Please wait a few seconds and try again.`,
    };
  }

  // Record this request
  recentTimestamps.push(now);
  userRequestTimestamps.set(userId, recentTimestamps);

  // Periodically clean up memory if map grows too large
  if (userRequestTimestamps.size > 2000) {
    for (const [uid, times] of userRequestTimestamps.entries()) {
      const valid = times.filter((t) => t > oneMinuteAgo);
      if (valid.length === 0) {
        userRequestTimestamps.delete(uid);
      } else {
        userRequestTimestamps.set(uid, valid);
      }
    }
  }

  // ─── 2. Database daily limit check ──────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), eq(expenses.expenseDate, today)));

  const todayCount = Number(countResult?.count || 0);

  if (todayCount >= RATE_LIMITS.MAX_EXPENSES_PER_DAY) {
    return {
      allowed: false,
      reason: `🛑 *Daily Limit Reached!* You have logged ${todayCount} expenses today (max ${RATE_LIMITS.MAX_EXPENSES_PER_DAY}/day).\n\nThis limit protects the free server from accidental spam. Your limit will reset at midnight!`,
    };
  }

  return { allowed: true };
}
