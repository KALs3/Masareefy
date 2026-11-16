import { Hono } from "hono";
import { db } from "../../db/client";
import { categories, expenses } from "../../db/schema";
import { eq, sql } from "drizzle-orm";
import { telegramAuth } from "../middleware/telegram-auth";
import { z } from "zod";

const categoriesRouter = new Hono<{
  Variables: {
    userId: number;
  };
}>();

categoriesRouter.use("*", telegramAuth);

// GET /api/categories (List categories with expense counts)
categoriesRouter.get("/", async (c) => {
  const userId = c.get("userId");

  const userCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      emoji: categories.emoji,
      budgetLimit: categories.budgetLimit,
      expenseCount: sql<number>`count(${expenses.id})`,
      totalSpent: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(categories)
    .leftJoin(expenses, eq(categories.id, expenses.categoryId))
    .where(eq(categories.userId, userId))
    .groupBy(categories.id, categories.name, categories.emoji, categories.budgetLimit)
    .orderBy(categories.name);

  return c.json({
    categories: userCategories.map((cat) => ({
      ...cat,
      expenseCount: Number(cat.expenseCount || 0),
      totalSpent: Number(cat.totalSpent || 0),
    })),
  });
});

// POST /api/categories (Create new custom category)
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  emoji: z.string().max(10).default("💸"),
  budgetLimit: z.number().positive().optional().nullable(),
});

categoriesRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.format() }, 400);
  }

  try {
    const [created] = await db
      .insert(categories)
      .values({
        userId,
        name: parsed.data.name,
        emoji: parsed.data.emoji || "💸",
        budgetLimit: parsed.data.budgetLimit ? parsed.data.budgetLimit.toFixed(2) : null,
      })
      .returning();

    return c.json({ category: created }, 201);
  } catch (error: unknown) {
    // Check for unique constraint violation (user_id, name)
    const dbErr = error as { code?: string };
    if (dbErr?.code === "23505") {
      return c.json(
        { error: "A category with this name already exists for your account" },
        409
      );
    }
    console.error("Create category error:", error);
    return c.json({ error: "Failed to create category" }, 500);
  }
});

export default categoriesRouter;
