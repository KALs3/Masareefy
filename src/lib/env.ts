import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)")
    .optional(),
  ENCRYPTION_KEY_VERSION: z
    .string()
    .regex(/^k[1-9][0-9]*$/, "ENCRYPTION_KEY_VERSION must be like k1, k2, ...")
    .default("k1"),
  WEBHOOK_SECRET_TOKEN: z
    .string()
    .min(16, "WEBHOOK_SECRET_TOKEN should be at least 16 characters")
    .optional(),
  WEBHOOK_URL: z.string().url().optional(),
  MINI_APP_URL: z.string().url().optional(),
});

// Lazy validation — only validate when accessed, not at import time.
// This prevents build-time errors when env vars aren't set yet.
let _env: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export type Env = z.infer<typeof envSchema>;
