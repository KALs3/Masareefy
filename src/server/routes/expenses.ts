import crypto from "node:crypto";
import { Hono } from "hono";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { telegramAuth } from "../middleware/telegram-auth";
import { z } from "zod";
import { encryptField, decryptField } from "../../lib/encryption";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AMOUNT = 999_999_999.99;

const expensesRouter = new Hono<{
  Variables: {
    userId: number;
  };
}>();

expensesRouter.use("*", telegramAuth);

/**
 * Verifies a category UUID belongs to the authenticated user (prevents cross-tenant IDOR).
 */
async function assertOwnedCategory(
  userId: number,
  categoryId: string | null | undefined
): Promise<boolean> {
  if (!categoryId) return true;
  if (!UUID_REGEX.test(categoryId)) return false;
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  return Boolean(cat);
}

// ─── GET /api/expenses (Paginated list with filters) ──────────────────────────
expensesRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query();

  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  const categoryId = query.category_id;
  const startDate = query.start_date;
  const endDate = query.end_date;
  const search = query.search?.trim().slice(0, 100);

  // Build filter conditions (always scoped by verified userId)
  const conditions = [eq(expenses.userId, userId)];

  if (categoryId && UUID_REGEX.test(categoryId)) {
    conditions.push(eq(expenses.categoryId, categoryId));
  }
  if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    conditions.push(gte(expenses.expenseDate, startDate));
  }
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    conditions.push(lte(expenses.expenseDate, endDate));
  }

  // If search is provided, decrypt in-memory (bounded to 2000 rows to avoid DoS)
  if (search) {
    const whereClause = and(...conditions);
    const allMatches = await db
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
      .limit(2000);

    const lowerSearch = search.toLowerCase();
    const decrypted = allMatches
      .map((r) => ({
        ...r,
        description: decryptField(r.description, {
          userId,
          recordId: r.id,
          field: "description",
        }),
      }))
      .filter((r) => r.description.toLowerCase().includes(lowerSearch));

    const paginated = decrypted.slice(offset, offset + limit);

    return c.json({
      data: paginated,
      pagination: {
        total: decrypted.length,
        limit,
        offset,
        hasMore: offset + limit < decrypted.length,
      },
    });
  }

  const whereClause = and(...conditions);

  // Total count matching query
  const [totalCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(expenses)
    .where(whereClause);

  const total = Number(totalCountResult?.count || 0);

  // Fetch paginated expenses joined with category
  const rawResults = await db
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

  const results = rawResults.map((r) => ({
    ...r,
    description: decryptField(r.description, {
      userId,
      recordId: r.id,
      field: "description",
    }),
  }));

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
  amount: z.number().finite().positive().max(MAX_AMOUNT),
  description: z.string().trim().min(1).max(255),
  categoryId: z.string().uuid().optional().nullable(),
  currency: z.string().trim().min(1).max(10).optional(),
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

  // Verify category belongs to this user
  if (!(await assertOwnedCategory(userId, parsed.data.categoryId))) {
    return c.json({ error: "Invalid category" }, 400);
  }

  // Get user details for currency & budget check
  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  const currency = parsed.data.currency || user?.currency || "EGP";

  // Pre-generate UUID so AAD cryptographically binds (userId, recordId, field)
  const expenseId = crypto.randomUUID();
  const encryptedDescription = encryptField(parsed.data.description, {
    userId,
    recordId: expenseId,
    field: "description",
  });

  const [created] = await db
    .insert(expenses)
    .values({
      id: expenseId,
      userId,
      amount: parsed.data.amount.toFixed(2),
      description: encryptedDescription,
      categoryId: parsed.data.categoryId || null,
      currency,
      sourceType: "manual",
      expenseDate: parsed.data.expenseDate || new Date().toISOString().split("T")[0],
    })
    .returning();

  // Check budget status
  let budgetAlert: { type: "warning" | "exceeded"; message: string } | null = null;
  const monthlyBudget = Number(user?.monthlyBudget || 0);

  if (monthlyBudget > 0) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const firstDay = `${year}-${month}-01`;
    const lastDay = new Date(year, now.getMonth() + 1, 0)
      .toISOString()
      .split("T")[0];

    const monthTotal = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.expenseDate, firstDay),
          lte(expenses.expenseDate, lastDay)
        )
      )
      .then((r) => Number(r[0]?.total || 0));

    const pct = (monthTotal / monthlyBudget) * 100;
    if (pct >= 100) {
      budgetAlert = {
        type: "exceeded",
        message: `You've exceeded your monthly budget (${pct.toFixed(0)}%) by ${(monthTotal - monthlyBudget).toFixed(2)} ${user?.currency}!`,
      };
    } else if (pct >= 80) {
      budgetAlert = {
        type: "warning",
        message: `You've used ${pct.toFixed(0)}% of your monthly budget. ${(monthlyBudget - monthTotal).toFixed(2)} ${user?.currency} remaining.`,
      };
    }
  }

  return c.json(
    {
      expense: {
        ...created,
        description: parsed.data.description,
      },
      budgetAlert,
    },
    201
  );
});

// ─── PATCH /api/expenses/:id (Update an expense) ──────────────────────────────
const updateExpenseSchema = z.object({
  amount: z.number().finite().positive().max(MAX_AMOUNT).optional(),
  description: z.string().trim().min(1).max(255).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  currency: z.string().trim().min(1).max(10).optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
    .optional(),
});

expensesRouter.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: "Invalid expense ID" }, 400);
  }

  const body = await c.req.json();
  const parsed = updateExpenseSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.format() }, 400);
  }

  if (
    parsed.data.categoryId !== undefined &&
    !(await assertOwnedCategory(userId, parsed.data.categoryId))
  ) {
    return c.json({ error: "Invalid category" }, 400);
  }

  const updateData: Partial<typeof expenses.$inferInsert> = {};
  if (parsed.data.amount !== undefined) {
    updateData.amount = parsed.data.amount.toFixed(2);
  }
  if (parsed.data.description !== undefined) {
    updateData.description = encryptField(parsed.data.description, {
      userId,
      recordId: id,
      field: "description",
    });
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

  return c.json({
    expense: {
      ...updated,
      description:
        parsed.data.description ??
        decryptField(updated.description, {
          userId,
          recordId: updated.id,
          field: "description",
        }),
    },
  });
});

// ─── DELETE /api/expenses/:id (Delete an expense) ────────────────────────────
expensesRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: "Invalid expense ID" }, 400);
  }

  const [deleted] = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });

  if (!deleted) {
    return c.json({ error: "Expense not found or unauthorized" }, 404);
  }

  return c.json({ success: true, message: "Expense deleted successfully" });
});

export default expensesRouter;
