import { Hono } from "hono";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { telegramAuth } from "../middleware/telegram-auth";

const dashboardRouter = new Hono<{
  Variables: {
    userId: number;
  };
}>();

dashboardRouter.use("*", telegramAuth);

// GET /api/dashboard?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
dashboardRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query();

  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Default to current month if no dates provided
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const defaultStartDate = `${year}-${month}-01`;
  const defaultEndDate = new Date(year, now.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];

  const startDate = query.start_date || defaultStartDate;
  const endDate = query.end_date || defaultEndDate;

  // 1. Total spent in period
  const [totalResult] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, startDate),
        lte(expenses.expenseDate, endDate)
      )
    );

  const totalSpent = Number(totalResult?.total || 0);
  const totalCount = Number(totalResult?.count || 0);

  // 2. Calculate daily average in the range
  const startD = new Date(startDate);
  const endD = new Date(endDate);
  const diffDays = Math.max(
    1,
    Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const dailyAverage = totalSpent / diffDays;

  // 3. Category breakdown
  const categoryBreakdown = await db
    .select({
      categoryId: expenses.categoryId,
      categoryName: sql<string>`COALESCE(${categories.name}, 'Other')`,
      categoryEmoji: sql<string>`COALESCE(${categories.emoji}, '💸')`,
      total: sql<string>`SUM(${expenses.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, startDate),
        lte(expenses.expenseDate, endDate)
      )
    )
    .groupBy(expenses.categoryId, categories.name, categories.emoji)
    .orderBy(desc(sql`SUM(${expenses.amount})`));

  const categoriesFormatted = categoryBreakdown.map((cat) => {
    const amount = Number(cat.total || 0);
    const percentage = totalSpent > 0 ? (amount / totalSpent) * 100 : 0;
    return {
      id: cat.categoryId,
      name: cat.categoryName,
      emoji: cat.categoryEmoji,
      total: amount,
      count: Number(cat.count || 0),
      percentage: Number(percentage.toFixed(1)),
    };
  });

  const topCategory = categoriesFormatted[0] || null;

  // 4. Daily spending trend (time series)
  const dailyTrend = await db
    .select({
      date: expenses.expenseDate,
      total: sql<string>`SUM(${expenses.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, startDate),
        lte(expenses.expenseDate, endDate)
      )
    )
    .groupBy(expenses.expenseDate)
    .orderBy(asc(expenses.expenseDate));

  const dailyTrendFormatted = dailyTrend.map((d) => ({
    date: d.date,
    amount: Number(d.total || 0),
    count: Number(d.count || 0),
  }));

  // 5. Monthly budget calculations
  const monthlyBudget = Number(user.monthlyBudget || 0);
  const remainingBudget = monthlyBudget > 0 ? monthlyBudget - totalSpent : null;
  const budgetUsagePercent =
    monthlyBudget > 0 ? Number(((totalSpent / monthlyBudget) * 100).toFixed(1)) : null;

  return c.json({
    period: {
      startDate,
      endDate,
      days: diffDays,
    },
    currency: user.currency || "EGP",
    kpis: {
      totalSpent,
      totalTransactions: totalCount,
      dailyAverage: Number(dailyAverage.toFixed(2)),
      topCategory: topCategory
        ? {
            name: topCategory.name,
            emoji: topCategory.emoji,
            total: topCategory.total,
            percentage: topCategory.percentage,
          }
        : null,
      monthlyBudget: monthlyBudget > 0 ? monthlyBudget : null,
      remainingBudget,
      budgetUsagePercent,
    },
    categoryBreakdown: categoriesFormatted,
    dailyTrend: dailyTrendFormatted,
  });
});

export default dashboardRouter;
