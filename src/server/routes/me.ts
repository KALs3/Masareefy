import { Hono } from "hono";
import { db } from "../../db/client";
import { users, expenses, categories } from "../../db/schema";
import { eq, sql } from "drizzle-orm";
import { telegramAuth } from "../middleware/telegram-auth";
import { z } from "zod";

const meRouter = new Hono<{
  Variables: {
    userId: number;
  };
}>();

meRouter.use("*", telegramAuth);

// GET /api/me
meRouter.get("/", async (c) => {
  const userId = c.get("userId");

  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const [expenseCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(eq(expenses.userId, userId));

  const [categoryCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.userId, userId));

  return c.json({
    user: {
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      currency: user.currency,
      monthlyBudget: user.monthlyBudget,
      createdAt: user.createdAt,
    },
    stats: {
      totalExpenses: Number(expenseCount?.count || 0),
      totalCategories: Number(categoryCount?.count || 0),
    },
  });
});

// PATCH /api/me
const updateMeSchema = z.object({
  currency: z.string().min(1).max(10).optional(),
  monthlyBudget: z.number().nonnegative().optional(),
});

meRouter.patch("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = updateMeSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.format() }, 400);
  }

  const updateData: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.currency !== undefined) {
    updateData.currency = parsed.data.currency;
  }
  if (parsed.data.monthlyBudget !== undefined) {
    updateData.monthlyBudget = parsed.data.monthlyBudget.toFixed(2);
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.telegramId, userId))
    .returning();

  return c.json({ user: updated });
});

export default meRouter;
