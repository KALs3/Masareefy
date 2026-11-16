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
const bot = createBot();

// Pre-create the grammY webhook handler with a 55s timeout and 'return' policy
// This prevents grammY from prematurely timing out at 10s and prevents Telegram retries
const handleUpdate = webhookCallback(bot, "hono", "return", 55_000);

// In-memory deduplication cache for Telegram update_id
const seenUpdateIds = new Map<number, number>();

app.post("/webhook", async (c) => {
  // 1. Inspect update_id to instantly drop duplicate Telegram retries
  try {
    const rawBody = await c.req.raw.clone().json();
    const updateId = rawBody?.update_id;

    if (updateId) {
      const now = Date.now();
      const lastSeen = seenUpdateIds.get(updateId);

      if (lastSeen && now - lastSeen < 120_000) {
        console.log(`[Dedupe] Dropping duplicate Telegram update_id: ${updateId}`);
        // Return 200 OK immediately so Telegram stops retrying
        return c.text("OK", 200);
      }

      seenUpdateIds.set(updateId, now);

      // Clean up stale IDs periodically
      if (seenUpdateIds.size > 500) {
        for (const [id, timestamp] of seenUpdateIds.entries()) {
          if (now - timestamp > 120_000) {
            seenUpdateIds.delete(id);
          }
        }
      }
    }
  } catch {
    // If body clone fails, proceed to handler normally
  }

  // 2. Delegate to grammY
  return handleUpdate(c);
});

// ─── Mini App REST API ────────────────────────────────────────────────────────
app.route("/me", meRouter);
app.route("/dashboard", dashboardRouter);
app.route("/expenses", expensesRouter);
app.route("/categories", categoriesRouter);

export default app;
export type AppType = typeof app;
