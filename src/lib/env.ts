import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
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
