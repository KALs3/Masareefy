"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface CategoryData {
  id: string | null;
  name: string;
  emoji: string;
  total: number;
  count: number;
  percentage: number;
}

interface CategoryDonutChartProps {
  categories: CategoryData[];
  currency: string;
}

const COLORS = [
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#64748b", // Slate
];

interface TooltipPayloadItem {
  payload: {
    name: string;
    value: number;
    percentage: number;
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}

export function CategoryDonutChart({ categories, currency }: CategoryDonutChartProps) {
  if (categories.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-sm">
        <span>No expenses recorded yet.</span>
      </div>
    );
  }

  const chartData = categories.map((cat, index) => ({
    name: `${cat.emoji} ${cat.name}`,
    value: cat.total,
    percentage: cat.percentage,
    color: COLORS[index % COLORS.length],
  }));

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700/80 px-3 py-2 rounded-xl shadow-xl text-xs">
          <div className="font-semibold text-white">{data.name}</div>
          <div className="text-emerald-400 font-medium mt-0.5">
            {data.value.toFixed(2)} {currency} ({data.percentage}%)
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-slate-200">Category Breakdown</h3>
        <span className="text-xs text-slate-400 font-normal">
          {categories.length} categories
        </span>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke="#020617"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Category Legends */}
      <div className="grid grid-cols-2 gap-2 mt-2 pt-3 border-t border-slate-800/60 text-xs">
        {categories.slice(0, 6).map((cat, i) => (
          <div key={i} className="flex items-center justify-between text-slate-300">
            <div className="flex items-center gap-1.5 truncate pr-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="truncate">{cat.emoji} {cat.name}</span>
            </div>
            <span className="font-medium text-slate-400 shrink-0">
              {cat.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
