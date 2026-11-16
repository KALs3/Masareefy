import { createHmac } from "crypto";
import type { MiddlewareHandler } from "hono";
import { getEnv } from "../../lib/env";
import { db } from "../../db/client";
import { users } from "../../db/schema";

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
): { valid: boolean; user?: TelegramUser } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    params.delete("hash");

    // Sort parameters alphabetically
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    // HMAC-SHA256 using WebAppData as key
    const secretKey = createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const computedHash = createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (computedHash !== hash) {
      return { valid: false };
    }

    const userStr = params.get("user");
    const user: TelegramUser | undefined = userStr ? JSON.parse(userStr) : undefined;

    return { valid: true, user };
  } catch (error) {
    console.error("Telegram initData verification error:", error);
    return { valid: false };
  }
}

/**
 * Hono middleware to authenticate Telegram Mini App requests.
 * Extracts user ID from verified initData and sets it in context as c.set('userId', userId).
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

  // 1. Try cryptographic verification with Telegram Bot Token
  if (initData) {
    const result = verifyTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
    if (result.valid && result.user?.id) {
      c.set("userId", result.user.id);
      c.set("telegramUser", result.user);
      return next();
    }
  }

  // 2. Dev mode fallback for local browser testing outside Telegram
  if (process.env.NODE_ENV !== "production") {
    const devUserIdHeader = c.req.header("X-Dev-User-Id");
    if (devUserIdHeader && !isNaN(Number(devUserIdHeader))) {
      c.set("userId", Number(devUserIdHeader));
      return next();
    }

    // Default to first user in database in local development if no header is present
    const firstUser = await db.select().from(users).limit(1).then((r) => r[0]);
    if (firstUser) {
      c.set("userId", firstUser.telegramId);
      return next();
    }
  }

  return c.json(
    {
      error: "Unauthorized",
      message: "Invalid or missing Telegram initData authentication.",
    },
    401
  );
};
