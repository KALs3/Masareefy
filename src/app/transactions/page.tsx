"use client";

import { useEffect, useState, useCallback } from "react";
import { useTelegram } from "@/hooks/use-telegram";
import { Navbar } from "@/components/navbar";
import {
  Search,
  Filter,
  Trash2,
  Edit2,
  Loader2,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  X,
  Save,
} from "lucide-react";
import Link from "next/link";

interface Transaction {
  id: string;
  amount: string;
  currency: string;
  description: string;
  sourceType: string;
  expenseDate: string;
  createdAt: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryEmoji: string | null;
}

interface Category {
  id: string;
  name: string;
  emoji: string;
}

export default function TransactionsPage() {
  const { isReady, getAuthHeaders, triggerHaptic } = useTelegram();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 20;

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [editingExpense, setEditingExpense] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Fetch transactions and categories
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAuthHeaders();

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      if (search.trim()) params.set("search", search.trim());
      if (selectedCategory) params.set("category_id", selectedCategory);

      const [txRes, catRes] = await Promise.all([
        fetch(`/api/expenses?${params.toString()}`, { headers }),
        fetch("/api/categories", { headers }),
      ]);

      if (!txRes.ok) throw new Error("Failed to load transactions");

      const txData = await txRes.json();
      const catData = catRes.ok ? await catRes.json() : { categories: [] };

      setTransactions(txData.data || []);
      setTotalCount(txData.pagination?.total || 0);
      setCategories(catData.categories || []);
    } catch (err: unknown) {
      console.error("Transactions fetch error:", err);
      const msg = err instanceof Error ? err.message : "Failed to load transactions.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, getAuthHeaders]);

  useEffect(() => {
    if (isReady) {
      fetchTransactions();
    }
  }, [isReady, fetchTransactions]);

  // Delete Expense
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    triggerHaptic("impact");

    try {
      const res = await fetch(`/api/expenses/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete expense");

      triggerHaptic("notification");
      fetchTransactions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete expense";
      alert(msg);
    }
  };

  // Open Edit Modal
  const openEditModal = (t: Transaction) => {
    triggerHaptic("selection");
    setEditingExpense(t);
    setEditAmount(t.amount);
    setEditDescription(t.description);
    setEditCategoryId(t.categoryId || "");
    setEditDate(t.expenseDate);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    setSavingEdit(true);

    try {
      const res = await fetch(`/api/expenses/${editingExpense.id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount: parseFloat(editAmount),
          description: editDescription.trim(),
          categoryId: editCategoryId || null,
          expenseDate: editDate,
        }),
      });

      if (!res.ok) throw new Error("Failed to update expense");

      triggerHaptic("notification");
      setEditingExpense(null);
      fetchTransactions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update expense";
      alert(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "voice":
        return "🎙️";
      case "photo":
        return "🧾";
      case "manual":
        return "✍️";
      default:
        return "💬";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                Transactions
              </h1>
              <p className="text-xs text-slate-400">
                {totalCount} total logged expenses
              </p>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="relative sm:w-48">
            <Filter className="w-3.5 h-3.5 absolute left-3.5 top-3 text-slate-500" />
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(0);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transactions List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
            <span className="text-xs">Loading transactions...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
            {error}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            No transactions found.
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((t) => (
              <div
                key={t.id}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex items-center justify-between gap-3"
              >
                {/* Left: Category Icon & Details */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-lg shrink-0 border border-slate-700/40">
                    {t.categoryEmoji || "💸"}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-white truncate">
                      {t.description}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span>{t.expenseDate}</span>
                      <span>•</span>
                      <span className="text-slate-300">
                        {t.categoryName || "Other"}
                      </span>
                      <span>•</span>
                      <span title={`Source: ${t.sourceType}`}>
                        {getSourceIcon(t.sourceType)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Amount & Action Buttons */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-bold text-sm text-emerald-400">
                      {Number(t.amount).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      {t.currency}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(t)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {totalCount > limit && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs text-slate-400">
            <span>
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, totalCount)}{" "}
              of {totalCount}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-slate-200">
                {page + 1}
              </span>
              <button
                onClick={() =>
                  setPage((p) => ((p + 1) * limit < totalCount ? p + 1 : p))
                }
                disabled={(page + 1) * limit >= totalCount}
                className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40 hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Edit Expense Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-400" />
                Edit Expense
              </h2>
              <button
                onClick={() => setEditingExpense(null)}
                className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Amount ({editingExpense.currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-semibold text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  required
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Category
                </label>
                <select
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Uncategorized</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.emoji} {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {savingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
