import {
  pgTable,
  bigint,
  varchar,
  text,
  numeric,
  timestamp,
  uuid,
  date,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  currency: varchar("currency", { length: 10 }).default("EGP"),
  monthlyBudget: numeric("monthly_budget", { precision: 12, scale: 2 }).default(
    "0.00"
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  categories: many(categories),
  expenses: many(expenses),
}));

// ─── Categories ───────────────────────────────────────────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: bigint("user_id", { mode: "number" })
      .references(() => users.telegramId, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    emoji: varchar("emoji", { length: 10 }).default("💸"),
    budgetLimit: numeric("budget_limit", { precision: 12, scale: 2 }),
  },
  (table) => [unique("uq_user_category").on(table.userId, table.name)]
);

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, {
    fields: [categories.userId],
    references: [users.telegramId],
  }),
  expenses: many(expenses),
}));

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: bigint("user_id", { mode: "number" })
      .references(() => users.telegramId, { onDelete: "cascade" })
      .notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    description: text("description").notNull(),
    sourceType: varchar("source_type", { length: 20 }).default("text"),
    expenseDate: date("expense_date").defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_expenses_user_date").on(table.userId, table.expenseDate),
    index("idx_expenses_category").on(table.categoryId),
  ]
);

export const expensesRelations = relations(expenses, ({ one }) => ({
  user: one(users, {
    fields: [expenses.userId],
    references: [users.telegramId],
  }),
  category: one(categories, {
    fields: [expenses.categoryId],
    references: [categories.id],
  }),
}));
