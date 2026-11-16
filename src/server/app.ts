import { Hono } from "hono";
import { createBot } from "../bot";
import { webhookCallback } from "grammy";
import meRouter from "./routes/me";
import dashboardRouter from "./routes/dashboard";
import expensesRouter from "./routes/expenses";
import categoriesRouter from "./routes/categories";

const app = new Hono().basePath("/api");

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() })
);

// ─── Telegram Webhook ─────────────────────────────────────────────────────────
app.post("/webhook", async (c) => {
  const bot = createBot();
  const handler = webhookCallback(bot, "hono");
  return handler(c);
});

// ─── Mini App REST API ────────────────────────────────────────────────────────
app.route("/me", meRouter);
app.route("/dashboard", dashboardRouter);
app.route("/expenses", expensesRouter);
app.route("/categories", categoriesRouter);

export default app;
export type AppType = typeof app;
