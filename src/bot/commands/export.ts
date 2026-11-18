import type { CommandContext, Context } from "grammy";
import { InputFile } from "grammy";
import { db } from "../../db/client";
import { expenses, categories, users } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { decryptText } from "../../lib/encryption";

function escapeCsvField(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * /export command — generates and sends a downloadable .csv file of all user transactions.
 */
export async function exportCommand(ctx: CommandContext<Context>) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, userId))
    .then((r) => r[0]);

  if (!user) {
    return ctx.reply("👋 Please run /start first to set up your account!");
  }

  await ctx.replyWithChatAction("upload_document");

  // Fetch all user expenses ordered by date descending
  const userExpenses = await db
    .select({
      id: expenses.id,
      date: expenses.expenseDate,
      description: expenses.description,
      amount: expenses.amount,
      currency: expenses.currency,
      sourceType: expenses.sourceType,
      createdAt: expenses.createdAt,
      categoryName: categories.name,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));

  if (userExpenses.length === 0) {
    return ctx.reply("📁 No expenses found to export! Start logging expenses first.");
  }

  // Generate CSV Header
  const headers = [
    "ID",
    "Date",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Source",
    "Created At",
  ];

  const rows = userExpenses.map((e) => [
    escapeCsvField(e.id),
    escapeCsvField(e.date),
    escapeCsvField(decryptText(e.description, userId)),
    escapeCsvField(e.categoryName || "Uncategorized"),
    escapeCsvField(e.amount),
    escapeCsvField(e.currency),
    escapeCsvField(e.sourceType),
    escapeCsvField(e.createdAt ? new Date(e.createdAt).toISOString() : ""),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const today = new Date().toISOString().split("T")[0];
  const filename = `expenses_${today}.csv`;
  const fileBuffer = Buffer.from(csvContent, "utf-8");

  await ctx.replyWithDocument(new InputFile(fileBuffer, filename), {
    caption: `📊 Exported *${userExpenses.length}* transactions into \`${filename}\``,
    parse_mode: "Markdown",
  });
}
