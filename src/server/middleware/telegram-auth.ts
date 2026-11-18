import { createHmac, timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { getEnv } from "../../lib/env";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { checkApiRateLimit } from "../../bot/utils/rate-limiter";

// Reject Telegram initData older than 1 hour (3600 seconds) to prevent replay attacks
const MAX_AUTH_AGE_SECONDS = 3600;
const MAX_FUTURE_SKEW_SECONDS = 60;

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: TelegramUser; reason?: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) {
      return { valid: false, reason: "missing_or_invalid_hash" };
    }

    // 1. Validate auth_date freshness (replay protection)
    const authDateStr = params.get("auth_date");
    const authDate = Number(authDateStr);
    if (!authDateStr || !Number.isFinite(authDate) || authDate <= 0) {
      return { valid: false, reason: "missing_auth_date" };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authDate > MAX_AUTH_AGE_SECONDS) {
      return { valid: false, reason: "expired_auth_date" };
    }
    if (authDate - nowSeconds > MAX_FUTURE_SKEW_SECONDS) {
      return { valid: false, reason: "future_auth_date" };
    }

    params.delete("hash");

    // 2. Sort parameters alphabetically
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    // 3. HMAC-SHA256 using WebAppData as key
    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computedDigest = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest();

    const providedDigest = Buffer.from(hash, "hex");

    // 4. Constant-time comparison (prevents timing attacks)
    if (
      computedDigest.length !== providedDigest.length ||
      !timingSafeEqual(computedDigest, providedDigest)
    ) {
      return { valid: false, reason: "hash_mismatch" };
    }

    const userStr = params.get("user");
    const user: TelegramUser | undefined = userStr ? JSON.parse(userStr) : undefined;
    if (!user || typeof user.id !== "number") {
      return { valid: false, reason: "missing_user" };
    }

    return { valid: true, user };
  } catch {
    // Log strictly without exposing initData payload
    console.error("[Auth] Telegram initData verification threw an error");
    return { valid: false, reason: "verification_exception" };
  }
}

/**
 * Hono middleware to authenticate Telegram Mini App requests.
 * Extracts user ID strictly from verified initData, checks freshness, and enforces API rate limits.
 */
export const telegramAuth: MiddlewareHandler<{
  Variables: {
    userId: number;
    telegramUser?: TelegramUser;
  };
}> = async (c, next) => {
  const authHeader = c.req.header("Authorization") || c.req.header("X-Telegram-Init-Data");
  const env = getEnv();

  let initData = "";
  if (authHeader) {
    if (authHeader.startsWith("tma ")) {
      initData = authHeader.slice(4).trim();
    } else {
      initData = authHeader.trim();
    }
  }

  // 1. Cryptographic verification with Telegram Bot Token
  if (initData) {
    const result = verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
    if (result.valid && result.user?.id) {
      if (!checkApiRateLimit(result.user.id)) {
        return c.json(
          { error: "Too Many Requests", message: "Rate limit exceeded. Please slow down." },
          429
        );
      }
      c.set("userId", result.user.id);
      c.set("telegramUser", result.user);
      return next();
    }

    // Log failed auth event (without sensitive token/initData) for security monitoring
    console.warn(`[Auth] Rejected Mini App request: ${result.reason || "invalid"}`);
  }

  // 2. Dev mode fallback ONLY in non-production environments
  if (process.env.NODE_ENV !== "production") {
    const devUserIdHeader = c.req.header("X-Dev-User-Id");
    if (devUserIdHeader && !isNaN(Number(devUserIdHeader))) {
      c.set("userId", Number(devUserIdHeader));
      return next();
    }

    const firstUser = await db.select().from(users).limit(1).then((r) => r[0]);
    if (firstUser) {
      c.set("userId", firstUser.telegramId);
      return next();
    }
  }

  return c.json(
    {
      error: "Unauthorized",
      message: "Invalid or expired Telegram authentication. Please reopen the Mini App.",
    },
    401
  );
};
