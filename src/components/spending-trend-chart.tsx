"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyTrendItem {
  date: string;
  amount: number;
  count: number;
}

interface SpendingTrendChartProps {
  trend: DailyTrendItem[];
  currency: string;
}

interface TrendTooltipPayload {
  payload: {
    date: string;
    amount: number;
    count: number;
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TrendTooltipPayload[];
}

export function SpendingTrendChart({ trend, currency }: SpendingTrendChartProps) {
  if (trend.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-sm">
        <span>No daily spending recorded yet.</span>
      </div>
    );
  }

  // Format dates for chart labels (e.g. 'Nov 15')
  const chartData = trend.map((item) => {
    const parts = item.date.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const shortDate = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

    return {
      date: item.date,
      shortDate,
      amount: item.amount,
      count: item.count,
    };
  });

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 border border-slate-700/80 px-3 py-2 rounded-xl shadow-xl text-xs">
          <div className="text-slate-400 font-medium">{data.date}</div>
          <div className="text-emerald-400 font-bold text-sm mt-0.5">
            {data.amount.toFixed(2)} {currency}
          </div>
          <div className="text-[11px] text-slate-500">
            {data.count} transaction{data.count > 1 ? "s" : ""}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm text-slate-200">Daily Spending Trend</h3>
        <span className="text-xs text-slate-400 font-normal">
          {trend.length} days
        </span>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="shortDate"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255, 255, 255, 0.05)" }} />
            <Bar
              dataKey="amount"
              fill="#10b981"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
