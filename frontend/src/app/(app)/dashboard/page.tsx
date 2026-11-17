"use client";

import { format, parseISO } from "date-fns";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  CheckCircle2,
  CheckSquare,
  Flame,
  ListTodo,
  NotebookPen,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import useSWR from "swr";

import { ActivityBarChart, SpendingAreaChart } from "@/components/charts";
import { HabitIcon } from "@/components/habit-icon";
import { useQuickAdd } from "@/components/shell/quick-add";
import { Badge, PRIORITY_BADGE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, EmptyState, Progress, Skeleton, StatCard } from "@/components/ui/misc";
import { api, revalidate } from "@/lib/api";
import type { Dashboard } from "@/lib/types";
import { cn, formatMoney, friendlyDateTime, greeting, timeAgo } from "@/lib/utils";

function ViewAll({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      View all <ArrowRight className="size-3.5" />
    </Link>
  );
}

export default function DashboardPage() {
  const { data, isLoading, mutate } = useSWR<Dashboard>("/api/dashboard");
  const { open } = useQuickAdd();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const { tasks, finance, habits } = data;
  const cur = finance.currency;
  const firstName = data.user.name.split(" ")[0];
  const todayPct = tasks.due_today ? (tasks.due_today_completed / tasks.due_today) * 100 : 0;
  const budgetPct = finance.budget ? (finance.budget.spent / finance.budget.amount) * 100 : 0;

  async function toggleTask(id: number, completed: boolean) {
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", json: { completed } });
      if (completed) toast.success("Nice work! Task completed 🎉");
      mutate();
      revalidate("/api/tasks");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update task");
    }
  }

  async function toggleHabit(id: number) {
    await api(`/api/habits/${id}/toggle`, { method: "POST", json: {} });
    mutate();
    revalidate("/api/habits");
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="brand-gradient relative overflow-hidden rounded-3xl p-6 text-white sm:p-8">
        <div className="absolute -right-16 -top-20 size-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">{format(parseISO(data.today), "EEEE, MMMM d, yyyy")}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {greeting()}, {firstName}!
            </h1>
            <p className="mt-2 max-w-lg text-white/85">
              {tasks.due_today - tasks.due_today_completed > 0
                ? `You have ${tasks.due_today - tasks.due_today_completed} task${tasks.due_today - tasks.due_today_completed === 1 ? "" : "s"} left today`
                : "You're all caught up for today"}
              {habits.total > 0 && ` · ${habits.done}/${habits.total} habits done`}
              {data.upcoming_reminders.length > 0 && ` · ${data.upcoming_reminders.length} upcoming reminder${data.upcoming_reminders.length === 1 ? "" : "s"}`}
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["task", "Task", CheckSquare],
                ["expense", "Expense", TrendingDown],
                ["reminder", "Reminder", Bell],
                ["note", "Note", NotebookPen],
              ] as const
            ).map(([kind, label, Icon]) => (
              <button
                key={kind}
                onClick={() => open(kind)}
                className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's tasks"
          value={`${tasks.due_today_completed}/${tasks.due_today}`}
          icon={ListTodo}
          sub={<Progress value={todayPct} />}
        />
        <StatCard
          label="Pending tasks"
          value={tasks.pending}
          icon={AlarmClock}
          tone={tasks.overdue ? "danger" : "accent"}
          sub={tasks.overdue ? <span className="font-medium text-danger">{tasks.overdue} overdue</span> : `${tasks.completed} completed in total`}
        />
        <StatCard
          label="Spent today"
          value={formatMoney(finance.today_expense, cur)}
          icon={Wallet}
          tone="warning"
          sub={
            <span>
              Income today: <span className="font-semibold text-success">{formatMoney(finance.today_income, cur)}</span>
            </span>
          }
        />
        <StatCard
          label="Habits today"
          value={`${Math.round(habits.progress)}%`}
          icon={Flame}
          tone="success"
          sub={<Progress value={habits.progress} color="var(--success)" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {/* Today's tasks */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today&apos;s focus</CardTitle>
            <ViewAll href="/tasks" />
          </CardHeader>
          <CardContent>
            {data.today_tasks.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nothing due today"
                description="Enjoy the calm, or plan something new."
                action={
                  <Button size="sm" onClick={() => open("task")}>
                    Add a task
                  </Button>
                }
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border">
                {data.today_tasks.map((t) => {
                  const overdue = !t.completed && t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <Checkbox checked={t.completed} onChange={(v) => toggleTask(t.id, v)} label={`Complete ${t.title}`} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-medium", t.completed && "text-muted-foreground line-through")}>
                          {t.title}
                        </p>
                        <p className={cn("text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
                          {t.due_date ? friendlyDateTime(t.due_date) : "No due date"}
                          {t.category && ` · ${t.category.name}`}
                        </p>
                      </div>
                      <Badge variant={PRIORITY_BADGE[t.priority]} className="capitalize">
                        {t.priority}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Reminders */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming reminders</CardTitle>
            <ViewAll href="/calendar" />
          </CardHeader>
          <CardContent>
            {data.upcoming_reminders.length === 0 ? (
              <EmptyState icon={Bell} title="No reminders" description="Set one so nothing slips through." className="py-8" />
            ) : (
              <ul className="space-y-3">
                {data.upcoming_reminders.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 rounded-xl bg-muted/60 p-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                      <Bell className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {friendlyDateTime(r.remind_at)}
                        {r.recurrence !== "none" && ` · ${r.recurrence}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>This week&apos;s activity</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Tasks completed and habit check-ins</p>
            </div>
            <div className="hidden items-center gap-4 text-xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#6366F1]" /> Tasks</span>
              <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[#A78BFA]" /> Habits</span>
            </div>
          </CardHeader>
          <CardContent>
            <ActivityBarChart data={data.week} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Habits</CardTitle>
            <ViewAll href="/habits" />
          </CardHeader>
          <CardContent>
            {habits.items.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No habits yet"
                description="Start with one small daily habit."
                action={<Button size="sm" onClick={() => open("habit")}>Create habit</Button>}
                className="py-8"
              />
            ) : (
              <ul className="space-y-2.5">
                {habits.items.map((h) => {
                  const done = h.frequency === "daily" ? h.done_today : h.done_this_week;
                  return (
                    <li key={h.id} className="flex items-center gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: h.color }}>
                        <HabitIcon name={h.icon} className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{h.name}</p>
                        <p className="text-xs text-muted-foreground">🔥 {h.current_streak} {h.frequency === "daily" ? "day" : "week"} streak</p>
                      </div>
                      <Checkbox checked={done} onChange={() => toggleHabit(h.id)} label={`Mark ${h.name}`} color={h.color} className="size-6" />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Spending this week</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMoney(data.week.reduce((s, d) => s + d.expense, 0), cur)} spent in the last 7 days
              </p>
            </div>
            <ViewAll href="/expenses" />
          </CardHeader>
          <CardContent>
            <SpendingAreaChart data={data.week} currency={cur} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-success-soft p-3">
                <p className="flex items-center gap-1 text-xs font-medium text-success"><TrendingUp className="size-3.5" /> Income</p>
                <p className="mt-1 font-bold">{formatMoney(finance.month_income, cur)}</p>
              </div>
              <div className="rounded-xl bg-accent-soft p-3">
                <p className="flex items-center gap-1 text-xs font-medium text-accent"><TrendingDown className="size-3.5" /> Expenses</p>
                <p className="mt-1 font-bold">{formatMoney(finance.month_expense, cur)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className={cn("font-bold", finance.month_balance >= 0 ? "text-success" : "text-danger")}>
                {formatMoney(finance.month_balance, cur)}
              </span>
            </div>
            {finance.budget && (
              <div>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-muted-foreground">Monthly budget</span>
                  <span className={cn("font-medium", budgetPct > 100 && "text-danger")}>
                    {Math.round(budgetPct)}% of {formatMoney(finance.budget.amount, cur)}
                  </span>
                </div>
                <Progress value={budgetPct} color={budgetPct > 100 ? "var(--danger)" : budgetPct > 80 ? "var(--warning)" : undefined} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-center">
              <div>
                <p className="text-xl font-bold">{data.month_summary.tasks_completed}</p>
                <p className="text-xs text-muted-foreground">tasks completed</p>
              </div>
              <div>
                <p className="text-xl font-bold">{data.month_summary.habit_checkins}</p>
                <p className="text-xs text-muted-foreground">habit check-ins</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <ViewAll href="/history" />
        </CardHeader>
        <CardContent>
          {data.recent_activity.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Your recent actions will show up here.</p>
          )}
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {data.recent_activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 text-sm">
                <span className="size-2 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1 truncate">{a.description}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
