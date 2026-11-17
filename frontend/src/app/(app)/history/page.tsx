"use client";

import { format, parseISO } from "date-fns";
import {
  Bell,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  History as HistoryIcon,
  NotebookPen,
  PiggyBank,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import useSWR from "swr";

import { ActivityBarChart, SpendingAreaChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Progress, Segmented, Skeleton, StatCard, type Tone } from "@/components/ui/misc";
import { useUser } from "@/hooks/use-user";
import { qs } from "@/lib/api";
import type { Activity, Page, Report } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";

const ENTITY: Record<string, { icon: LucideIcon; tone: Tone; label: string }> = {
  task: { icon: CheckSquare, tone: "primary", label: "Tasks" },
  transaction: { icon: Wallet, tone: "warning", label: "Transactions" },
  budget: { icon: PiggyBank, tone: "warning", label: "Budgets" },
  habit: { icon: Target, tone: "success", label: "Habits" },
  reminder: { icon: Bell, tone: "accent", label: "Reminders" },
  note: { icon: NotebookPen, tone: "primary", label: "Notes" },
  account: { icon: UserRound, tone: "accent", label: "Account" },
};
const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

function groupByDay(items: Activity[]) {
  const map = new Map<string, Activity[]>();
  for (const a of items) {
    const key = format(new Date(a.created_at), "yyyy-MM-dd");
    map.set(key, [...(map.get(key) ?? []), a]);
  }
  return [...map.entries()];
}

export default function HistoryPage() {
  const { currency } = useUser();
  const [period, setPeriod] = React.useState<"week" | "month">("week");
  const [offset, setOffset] = React.useState(0);
  const [entity, setEntity] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => setOffset(0), [period]);
  React.useEffect(() => setPage(1), [entity]);

  const { data: report } = useSWR<Report>(`/api/reports${qs({ period, offset })}`);
  const { data: activity, isLoading } = useSWR<Page<Activity>>(`/api/activity${qs({ entity_type: entity, page, page_size: 25 })}`);

  const range = report
    ? period === "week"
      ? `${format(parseISO(report.start), "MMM d")} – ${format(parseISO(report.end), "MMM d, yyyy")}`
      : format(parseISO(report.start), "MMMM yyyy")
    : "";
  const totalPages = activity ? Math.max(1, Math.ceil(activity.total / activity.page_size)) : 1;

  return (
    <>
      <PageHeader
        title="Activity History"
        description="Review your progress and understand your patterns."
        actions={
          <>
            <Segmented
              value={period}
              onChange={setPeriod}
              options={[
                { value: "week", label: "Weekly" },
                { value: "month", label: "Monthly" },
              ]}
            />
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
              <Button variant="ghost" size="icon" className="size-8" aria-label="Previous period" onClick={() => setOffset(offset + 1)}>
                <ChevronLeft />
              </Button>
              <span className="min-w-36 text-center text-sm font-semibold">{range}</span>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Next period" disabled={offset === 0} onClick={() => setOffset(offset - 1)}>
                <ChevronRight />
              </Button>
            </div>
          </>
        }
      />

      {!report ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Tasks completed" value={report.tasks_completed} icon={CheckCircle2} sub={`${report.tasks_created} new tasks created`} />
            <StatCard
              label="Habit consistency"
              value={`${report.habit_rate}%`}
              icon={Target}
              tone="success"
              sub={<Progress value={report.habit_rate} color="var(--success)" />}
            />
            <StatCard
              label="Spent"
              value={formatMoney(report.expense, currency)}
              icon={TrendingDown}
              tone="accent"
              sub={
                <span>
                  Income <span className="font-semibold text-success">{formatMoney(report.income, currency)}</span>
                </span>
              }
            />
            <StatCard
              label="Most productive day"
              value={report.most_productive_day ? format(parseISO(report.most_productive_day), period === "week" ? "EEEE" : "MMM d") : "—"}
              icon={Star}
              tone="warning"
              sub={`${report.reminders_completed} reminders completed`}
            />
          </section>

          <section className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Productivity</CardTitle>
                <span className="text-xs text-muted-foreground">{report.habit_checkins} habit check-ins</span>
              </CardHeader>
              <CardContent>
                <ActivityBarChart data={report.series} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Money flow</CardTitle>
                <span className={cn("text-xs font-semibold", report.balance >= 0 ? "text-success" : "text-danger")}>
                  {report.balance >= 0 ? <TrendingUp className="mr-1 inline size-3.5" /> : <TrendingDown className="mr-1 inline size-3.5" />}
                  {formatMoney(report.balance, currency)} net
                </span>
              </CardHeader>
              <CardContent>
                <SpendingAreaChart data={report.series} currency={currency} showIncome />
              </CardContent>
            </Card>
          </section>

          {report.top_categories.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Top spending categories</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {report.top_categories.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="truncate font-medium">{c.name}</span>
                    </div>
                    <Progress value={(c.total / report.expense) * 100} color={c.color} />
                    <p className="mt-1 text-xs text-muted-foreground">{formatMoney(c.total, currency)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <CardTitle>Activity log</CardTitle>
          <Select className="sm:w-52" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Filter activity">
            <option value="">All activity</option>
            {Object.entries(ENTITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading && !activity ? (
            <Skeleton className="h-64" />
          ) : activity && activity.items.length > 0 ? (
            <>
              <div className="space-y-6">
                {groupByDay(activity.items).map(([day, items]) => (
                  <div key={day}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {format(parseISO(day), "EEEE, MMMM d")}
                    </p>
                    <ul className="relative space-y-1 border-l-2 border-border pl-5">
                      {items.map((a) => {
                        const meta = ENTITY[a.entity_type] ?? ENTITY.account!;
                        const Icon = meta.icon;
                        return (
                          <li key={a.id} className="relative flex items-center gap-3 py-1.5">
                            <span className={cn("absolute -left-[33px] grid size-6 place-items-center rounded-full ring-4 ring-card", TONE_CLASS[meta.tone])}>
                              <Icon className="size-3" />
                            </span>
                            <span className="flex-1 text-sm">{a.description}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(a.created_at), "h:mm a")}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Newer
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      Older
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={HistoryIcon} title="No activity yet" description="Your actions across Dayora will appear here." />
          )}
        </CardContent>
      </Card>
    </>
  );
}
