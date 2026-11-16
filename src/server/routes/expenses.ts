import { Hono } from "hono";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, gte, lte, desc, sql, ilike } from "drizzle-orm";
import { telegramAuth } from "../middleware/telegram-auth";
import { z } from "zod";

const expensesRouter = new Hono<{
  Variables: {
    userId: number;
  };
}>();

expensesRouter.use("*", telegramAuth);

// ─── GET /api/expenses (Paginated list with filters) ──────────────────────────
expensesRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query();

  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const categoryId = query.category_id;
  const startDate = query.start_date;
  const endDate = query.end_date;
  const search = query.search?.trim();

  // Build filter conditions
  const conditions = [eq(expenses.userId, userId)];

  if (categoryId) {
    conditions.push(eq(expenses.categoryId, categoryId));
  }
  if (startDate) {
    conditions.push(gte(expenses.expenseDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(expenses.expenseDate, endDate));
  }
  if (search) {
    conditions.push(ilike(expenses.description, `%${search}%`));
  }

  const whereClause = and(...conditions);

  // Total count matching query
  const [totalCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(whereClause);

  const total = Number(totalCountResult?.count || 0);

  // Fetch paginated expenses joined with category
  const results = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      currency: expenses.currency,
      description: expenses.description,
      sourceType: expenses.sourceType,
      expenseDate: expenses.expenseDate,
      createdAt: expenses.createdAt,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(whereClause)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    data: results,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
});

// ─── POST /api/expenses (Manual expense creation from dashboard) ──────────────
const createExpenseSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1).max(255),
  categoryId: z.string().uuid().optional().nullable(),
  currency: z.string().min(1).max(10).optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
});

expensesRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = createExpenseSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.format() }, 400);
  }

  // Get user's default currency if not provided
  let currency = parsed.data.currency;
  if (!currency) {
    const user = await db
      .select({ currency: users.currency })
      .from(users)
      .where(eq(users.telegramId, userId))
      .then((r) => r[0]);
    currency = user?.currency || "EGP";
  }

  const [created] = await db
    .insert(expenses)
    .values({
      userId,
      amount: parsed.data.amount.toFixed(2),
      description: parsed.data.description,
      categoryId: parsed.data.categoryId || null,
      currency,
      sourceType: "manual",
      expenseDate: parsed.data.expenseDate || new Date().toISOString().split("T")[0],
    })
    .returning();

  return c.json({ expense: created }, 201);
});

// ─── PATCH /api/expenses/:id (Update an expense) ──────────────────────────────
const updateExpenseSchema = z.object({
  amount: z.number().positive().optional(),
  description: z.string().min(1).max(255).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  currency: z.string().min(1).max(10).optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
});

expensesRouter.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateExpenseSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.format() }, 400);
  }

  const updateData: Partial<typeof expenses.$inferInsert> = {};
  if (parsed.data.amount !== undefined) {
    updateData.amount = parsed.data.amount.toFixed(2);
  }
  if (parsed.data.description !== undefined) {
    updateData.description = parsed.data.description;
  }
  if (parsed.data.categoryId !== undefined) {
    updateData.categoryId = parsed.data.categoryId;
  }
  if (parsed.data.currency !== undefined) {
    updateData.currency = parsed.data.currency;
  }
  if (parsed.data.expenseDate !== undefined) {
    updateData.expenseDate = parsed.data.expenseDate;
  }

  const [updated] = await db
    .update(expenses)
    .set(updateData)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning();

  if (!updated) {
    return c.json({ error: "Expense not found or unauthorized" }, 404);
  }

  return c.json({ expense: updated });
});

// ─── DELETE /api/expenses/:id (Delete an expense) ────────────────────────────
expensesRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning();

  if (!deleted) {
    return c.json({ error: "Expense not found or unauthorized" }, 404);
  }

  return c.json({ success: true, message: "Expense deleted successfully" });
});

export default expensesRouter;
