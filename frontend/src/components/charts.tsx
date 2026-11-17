"use client";

import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@/lib/utils";

const axis = { fontSize: 12, fill: "var(--muted-foreground)" };
const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.08)",
  },
  labelStyle: { color: "var(--foreground)", fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: "var(--foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.6 },
};

const dayLabel = (d: string, long = false) => format(parseISO(d), long ? "EEE, MMM d" : "EEE");

export function ActivityBarChart({
  data,
  height = 240,
}: {
  data: { date: string; tasks_completed: number; habit_checkins: number }[];
  height?: number;
}) {
  const short = data.length > 10;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={axis}
          tickFormatter={(d) => (short ? format(parseISO(d), "d") : dayLabel(d))}
          interval={short ? "preserveStartEnd" : 0}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axis} />
        <Tooltip {...tooltipStyle} labelFormatter={(d) => dayLabel(String(d), true)} />
        <Bar dataKey="tasks_completed" name="Tasks done" fill="#6366F1" radius={[6, 6, 0, 0]} maxBarSize={22} />
        <Bar dataKey="habit_checkins" name="Habit check-ins" fill="#A78BFA" radius={[6, 6, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingAreaChart({
  data,
  currency,
  height = 240,
  showIncome = false,
}: {
  data: { date: string; expense: number; income: number }[];
  currency: string;
  height?: number;
  showIncome?: boolean;
}) {
  const short = data.length > 10;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tick={axis}
          tickFormatter={(d) => (short ? format(parseISO(d), "MMM d") : dayLabel(d))}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axis}
          tickFormatter={(v) => formatMoney(Number(v), currency, true)}
          width={56}
        />
        <Tooltip
          {...tooltipStyle}
          cursor={{ stroke: "var(--border)" }}
          labelFormatter={(d) => dayLabel(String(d), true)}
          formatter={(v) => formatMoney(Number(v), currency)}
        />
        {showIncome && (
          <Area type="monotone" dataKey="income" name="Income" stroke="#10B981" strokeWidth={2.5} fill="url(#inc)" />
        )}
        <Area type="monotone" dataKey="expense" name="Spent" stroke="#8B5CF6" strokeWidth={2.5} fill="url(#exp)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({
  data,
  currency,
  height = 220,
}: {
  data: { name: string; total: number; color: string }[];
  currency: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none">
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} formatter={(v) => formatMoney(Number(v), currency)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
