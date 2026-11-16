"use client";

import { CreditCard, TrendingUp, Award, Target } from "lucide-react";

interface KpiData {
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
}

interface KpiCardsProps {
  kpis: KpiData;
  currency: string;
}

export function KpiCards({ kpis, currency }: KpiCardsProps) {
  const cards = [
    {
      title: "Total Spent",
      value: `${kpis.totalSpent.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${currency}`,
      subtitle: `${kpis.totalTransactions} transactions`,
      icon: CreditCard,
      color: "from-emerald-500/20 to-teal-500/5",
      borderColor: "border-emerald-500/20",
      iconColor: "text-emerald-400",
    },
    {
      title: "Daily Average",
      value: `${kpis.dailyAverage.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} ${currency}`,
      subtitle: "Per active day",
      icon: TrendingUp,
      color: "from-blue-500/20 to-cyan-500/5",
      borderColor: "border-blue-500/20",
      iconColor: "text-blue-400",
    },
    {
      title: "Top Category",
      value: kpis.topCategory
        ? `${kpis.topCategory.emoji} ${kpis.topCategory.name}`
        : "None yet",
      subtitle: kpis.topCategory
        ? `${kpis.topCategory.total.toFixed(2)} ${currency} (${kpis.topCategory.percentage}%)`
        : "No spending",
      icon: Award,
      color: "from-amber-500/20 to-orange-500/5",
      borderColor: "border-amber-500/20",
      iconColor: "text-amber-400",
    },
    {
      title: "Budget Status",
      value:
        kpis.monthlyBudget !== null
          ? kpis.remainingBudget !== null && kpis.remainingBudget >= 0
            ? `${kpis.remainingBudget.toFixed(2)} ${currency}`
            : `Over by ${Math.abs(kpis.remainingBudget || 0).toFixed(2)} ${currency}`
          : "No Limit Set",
      subtitle:
        kpis.monthlyBudget !== null
          ? `${kpis.budgetUsagePercent}% of ${kpis.monthlyBudget.toFixed(2)} ${currency}`
          : "Tap settings to set budget",
      icon: Target,
      color:
        kpis.monthlyBudget !== null &&
        kpis.remainingBudget !== null &&
        kpis.remainingBudget < 0
          ? "from-rose-500/20 to-red-500/5"
          : "from-purple-500/20 to-pink-500/5",
      borderColor:
        kpis.monthlyBudget !== null &&
        kpis.remainingBudget !== null &&
        kpis.remainingBudget < 0
          ? "border-rose-500/30"
          : "border-purple-500/20",
      iconColor:
        kpis.monthlyBudget !== null &&
        kpis.remainingBudget !== null &&
        kpis.remainingBudget < 0
          ? "text-rose-400"
          : "text-purple-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={i}
            className={`p-4 rounded-2xl bg-gradient-to-b ${card.color} bg-slate-900/60 border ${card.borderColor} backdrop-blur-sm flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">{card.title}</span>
              <div className={`p-1.5 rounded-lg bg-slate-950/40 ${card.iconColor}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-slate-100 tracking-tight truncate">
                {card.value}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {card.subtitle}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
