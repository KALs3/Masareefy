"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useTelegram } from "@/hooks/use-telegram";
import { Navbar } from "@/components/navbar";
import { KpiCards } from "@/components/kpi-cards";
import { AddExpenseModal } from "@/components/add-expense-modal";
import { BudgetSettingsModal } from "@/components/budget-settings-modal";
import { Plus, ArrowRight, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

const CategoryDonutChart = dynamic(
  () =>
    import("@/components/category-donut-chart").then(
      (mod) => mod.CategoryDonutChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center text-slate-500 text-xs">
        Loading chart...
      </div>
    ),
  }
);

const SpendingTrendChart = dynamic(
  () =>
    import("@/components/spending-trend-chart").then(
      (mod) => mod.SpendingTrendChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-center text-slate-500 text-xs">
        Loading chart...
      </div>
    ),
  }
);

interface DashboardData {
  currency: string;
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  kpis: {
    totalSpent: number;
    totalTransactions: number;
    dailyAverage: number;
    topCategory: {
      name: string;
      emoji: string;
      total: number;
      percentage: number;
    } | null;
    monthlyBudget: number | null;
    remainingBudget: number | null;
    budgetUsagePercent: number | null;
  };
  categoryBreakdown: Array<{
    id: string | null;
    name: string;
    emoji: string;
    total: number;
    count: number;
    percentage: number;
  }>;
  dailyTrend: Array<{
    date: string;
    amount: number;
    count: number;
  }>;
}

interface Category {
  id: string;
  name: string;
  emoji: string;
}

export default function DashboardPage() {
  const { isReady, user, getAuthHeaders, triggerHaptic } = useTelegram();

  const [data, setData] = useState<DashboardData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [period, setPeriod] = useState<"this_month" | "7d" | "30d">("this_month");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Calculate date range based on selected period
      const now = new Date();
      let startDate = "";
      const endDate = now.toISOString().split("T")[0];

      if (period === "this_month") {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        startDate = `${year}-${month}-01`;
      } else if (period === "7d") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startDate = d.toISOString().split("T")[0];
      } else if (period === "30d") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startDate = d.toISOString().split("T")[0];
      }

      const headers = getAuthHeaders();

      // Parallel fetch dashboard and categories
      const [dashRes, catRes] = await Promise.all([
        fetch(`/api/dashboard?start_date=${startDate}&end_date=${endDate}`, {
          headers,
        }),
        fetch("/api/categories", { headers }),
      ]);

      if (!dashRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const dashJson = await dashRes.json();
      const catJson = catRes.ok ? await catRes.json() : { categories: [] };

      setData(dashJson);
      setCategories(catJson.categories || []);
    } catch (err: unknown) {
      console.error("Dashboard fetch error:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong loading your dashboard.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [period, getAuthHeaders]);

  useEffect(() => {
    if (isReady) {
      fetchData();
    }
  }, [isReady, fetchData]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar onOpenSettings={() => setIsSettingsModalOpen(true)} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-5 space-y-6">
        {/* Welcome Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Welcome{user?.first_name ? `, ${user.first_name}` : ""}!
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-2.5 h-2.5 mr-1" />
                Live
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Here is your financial spending overview.
            </p>
          </div>

          <button
            onClick={() => {
              triggerHaptic("selection");
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>

        {/* Time Period Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80 w-fit">
          {[
            { id: "this_month" as const, label: "This Month" },
            { id: "7d" as const, label: "Last 7 Days" },
            { id: "30d" as const, label: "Last 30 Days" },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => {
                triggerHaptic("selection");
                setPeriod(pill.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                period === pill.id
                  ? "bg-slate-800 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-xs font-medium">Crunching your numbers...</span>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={fetchData}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Dashboard Content */}
        {!loading && data && (
          <>
            {/* KPI Cards */}
            <KpiCards kpis={data.kpis} currency={data.currency} />

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CategoryDonutChart
                categories={data.categoryBreakdown}
                currency={data.currency}
              />
              <SpendingTrendChart
                trend={data.dailyTrend}
                currency={data.currency}
              />
            </div>

            {/* Quick Actions / Link to full transactions */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-white">
                  Looking for full transaction history?
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Search, filter, edit or delete any logged expense.
                </p>
              </div>
              <Link
                href="/transactions"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors shrink-0"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        )}
      </main>

      {/* Modals */}
      {data && (
        <>
          <AddExpenseModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onExpenseAdded={() => {
              triggerHaptic("notification");
              fetchData();
            }}
            categories={categories}
            currency={data.currency}
            getAuthHeaders={getAuthHeaders}
          />

          <BudgetSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            onSettingsUpdated={() => {
              triggerHaptic("notification");
              fetchData();
            }}
            currentCurrency={data.currency}
            currentBudget={data.kpis.monthlyBudget}
            getAuthHeaders={getAuthHeaders}
          />
        </>
      )}
    </div>
  );
}
