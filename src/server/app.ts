import { Hono } from "hono";
import { createBot } from "../bot";
import { webhookCallback } from "grammy";

const app = new Hono().basePath("/api");

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── Telegram Webhook ─────────────────────────────────────────────────────────
// grammY's webhookCallback creates a Hono-compatible handler that:
// 1. Parses the incoming Telegram Update JSON
// 2. Runs it through the bot's middleware stack
// 3. Returns 200 OK to Telegram
app.post("/webhook", async (c) => {
  const bot = createBot();
  const handler = webhookCallback(bot, "hono");
  return handler(c);
});

// ─── Mini App REST API (Milestone 3) ──────────────────────────────────────────
// These will be added when we build the frontend dashboard:
// app.route("/me", meRoutes);
// app.route("/expenses", expenseRoutes);
// app.route("/categories", categoryRoutes);
// app.route("/dashboard", dashboardRoutes);

export default app;
export type AppType = typeof app;
