import { useNavigation } from "@react-navigation/native";
import { format } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import * as React from "react";
import { Pressable, View } from "react-native";

import { api } from "../api";
import { useUser } from "../auth";
import { BarChart, Ring } from "../charts";
import { HabitForm, ReminderForm, TaskForm, TransactionForm, habitIcon } from "../forms";
import { invalidate, useQuery } from "../query";
import { BRAND, useColors } from "../theme";
import type { Dashboard } from "../types";
import {
  Avatar,
  Card,
  CardHeader,
  Checkbox,
  Empty,
  ErrorBox,
  Icon,
  type IconName,
  IconTile,
  Loading,
  Progress,
  Row,
  Screen,
  T,
  errorMessage,
  toast,
} from "../ui";
import { formatMoney, friendlyDateTime, greeting, parseDateOnly, timeAgo } from "../utils";

export function DashboardScreen() {
  const c = useColors();
  const user = useUser();
  const nav = useNavigation<any>();
  const { data, error, loading, refreshing, refresh, mutate } = useQuery<Dashboard>("/api/dashboard");
  const [sheet, setSheet] = React.useState<null | "task" | "expense" | "habit" | "reminder">(null);

  async function toggleTask(id: number, completed: boolean) {
    if (data) mutate({ ...data, today_tasks: data.today_tasks.map((t) => (t.id === id ? { ...t, completed } : t)) });
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", json: { completed } });
      if (completed) toast("Nice! Task completed");
    } catch (e) {
      toast(errorMessage(e));
    }
    invalidate("/api/dashboard", "/api/tasks", "/api/activity");
  }

  async function toggleHabit(id: number) {
    try {
      await api(`/api/habits/${id}/toggle`, { method: "POST", json: {} });
    } catch (e) {
      toast(errorMessage(e));
    }
    invalidate("/api/dashboard", "/api/habits", "/api/activity");
  }

  const quick: { label: string; icon: IconName; color: string; onPress: () => void }[] = [
    { label: "Task", icon: "check-square", color: c.primary, onPress: () => setSheet("task") },
    { label: "Expense", icon: "credit-card", color: c.danger, onPress: () => setSheet("expense") },
    { label: "Reminder", icon: "bell", color: c.accent, onPress: () => setSheet("reminder") },
    { label: "Note", icon: "edit-3", color: c.warning, onPress: () => nav.navigate("NoteEditor", { id: null }) },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 20, marginTop: 12, gap: 16 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <T variant="small" color="rgba(255,255,255,0.8)">{format(new Date(), "EEEE, MMMM d")}</T>
            <T variant="h2" color="#fff" numberOfLines={1}>
              {greeting()}, {(data?.user.name || user.name).split(" ")[0]} 👋
            </T>
          </View>
          <Pressable onPress={() => nav.navigate("Settings")}>
            <Avatar name={data?.user.name || user.name} url={data?.user.avatar_url ?? user.avatar_url} size={46} />
          </Pressable>
        </Row>
        {data ? (
          <Row gap={14}>
            <Ring value={data.tasks.due_today ? (data.tasks.due_today_completed / data.tasks.due_today) * 100 : 0} size={62} color="#fff">
              <T variant="label" color="#fff">{data.tasks.due_today_completed}/{data.tasks.due_today}</T>
            </Ring>
            <View style={{ flex: 1 }}>
              <T color="#fff" weight="700">
                {data.tasks.due_today === 0
                  ? "Nothing due today"
                  : data.tasks.due_today_completed === data.tasks.due_today
                    ? "All done for today 🎉"
                    : `${data.tasks.due_today - data.tasks.due_today_completed} tasks left today`}
              </T>
              <T variant="small" color="rgba(255,255,255,0.8)">
                {data.tasks.overdue ? `${data.tasks.overdue} overdue · ` : ""}
                {data.habits.done}/{data.habits.total} habits done
              </T>
            </View>
          </Row>
        ) : null}
      </LinearGradient>

      <Row gap={10}>
        {quick.map((q) => (
          <Pressable key={q.label} onPress={q.onPress} style={{ flex: 1 }}>
            <Card style={{ alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 4 }}>
              <IconTile name={q.icon} color={q.color} size={36} />
              <T variant="caption" weight="600">{q.label}</T>
            </Card>
          </Pressable>
        ))}
      </Row>

      <Row gap={8}>
        {(
          [
            { label: "Notes", icon: "file-text", to: "Notes" },
            { label: "History", icon: "bar-chart-2", to: "History" },
            { label: "Settings", icon: "settings", to: "Settings" },
          ] as { label: string; icon: IconName; to: string }[]
        ).map((l) => (
          <Pressable
            key={l.to}
            onPress={() => nav.navigate(l.to)}
            style={({ pressed }) => ({ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name={l.icon} size={15} color={c.primary} />
            <T variant="label" color={c.primary}>{l.label}</T>
          </Pressable>
        ))}
      </Row>

      {error && !data ? <ErrorBox error={error} onRetry={refresh} /> : null}
      {loading ? <Loading /> : null}

      {data ? (
        <>
          <Row gap={10}>
            <Card style={{ flex: 1, gap: 4 }}>
              <T variant="caption" muted>Today spent</T>
              <T variant="h2" color={c.danger} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(data.finance.today_expense, data.finance.currency)}</T>
              <T variant="caption" muted numberOfLines={1}>Income {formatMoney(data.finance.today_income, data.finance.currency)}</T>
            </Card>
            <Card style={{ flex: 1, gap: 4 }} onPress={() => nav.navigate("Money")}>
              <T variant="caption" muted>This month</T>
              <T variant="h2" color={data.finance.month_balance >= 0 ? c.success : c.danger} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(data.finance.month_balance, data.finance.currency)}
              </T>
              <T variant="caption" muted numberOfLines={1}>Spent {formatMoney(data.finance.month_expense, data.finance.currency, true)}</T>
            </Card>
          </Row>

          {data.finance.budget ? (
            <Card style={{ gap: 10 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <T variant="label">Monthly budget</T>
                <T variant="caption" muted>
                  {formatMoney(data.finance.budget.spent, data.finance.currency, true)} / {formatMoney(data.finance.budget.amount, data.finance.currency, true)}
                </T>
              </Row>
              <Progress
                value={(data.finance.budget.spent / data.finance.budget.amount) * 100}
                color={data.finance.budget.spent > data.finance.budget.amount ? c.danger : data.finance.budget.spent > data.finance.budget.amount * 0.8 ? c.warning : c.success}
              />
            </Card>
          ) : null}

          <Card style={{ gap: 12 }}>
            <CardHeader title="Today's tasks" action="See all" onAction={() => nav.navigate("Tasks")} />
            {data.today_tasks.length === 0 ? (
              <Empty icon="check-circle" title="You're all clear" text="No tasks due today." action="Add task" onAction={() => setSheet("task")} />
            ) : (
              data.today_tasks.map((t) => (
                <Row key={t.id} gap={12}>
                  <Checkbox checked={t.completed} onPress={() => toggleTask(t.id, !t.completed)} />
                  <View style={{ flex: 1 }}>
                    <T style={t.completed ? { textDecorationLine: "line-through", color: c.mutedForeground } : null} numberOfLines={1}>{t.title}</T>
                    {t.due_date ? (
                      <T variant="caption" color={!t.completed && new Date(t.due_date) < new Date() ? c.danger : c.mutedForeground}>
                        {friendlyDateTime(t.due_date)}
                      </T>
                    ) : null}
                  </View>
                  {t.priority === "high" ? <Icon name="flag" size={14} color={c.danger} /> : null}
                </Row>
              ))
            )}
          </Card>

          <Card style={{ gap: 12 }}>
            <CardHeader title="Habits" action="Open" onAction={() => nav.navigate("Habits")} />
            {data.habits.items.length === 0 ? (
              <Empty icon="target" title="No habits yet" text="Small daily wins add up." action="New habit" onAction={() => setSheet("habit")} />
            ) : (
              <>
                <Progress value={data.habits.progress} color={c.success} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {data.habits.items.map((h) => {
                    const done = h.frequency === "daily" ? h.done_today : h.done_this_week;
                    return (
                      <Pressable
                        key={h.id}
                        onPress={() => toggleHabit(h.id)}
                        style={{ width: "31%", alignItems: "center", gap: 6, padding: 10, borderRadius: 14, backgroundColor: done ? h.color : c.muted }}
                      >
                        <Icon name={done ? "check" : habitIcon(h.icon)} color={done ? "#fff" : h.color} />
                        <T variant="caption" weight="600" numberOfLines={1} color={done ? "#fff" : c.foreground}>{h.name}</T>
                        <T variant="caption" color={done ? "rgba(255,255,255,0.85)" : c.mutedForeground}>🔥 {h.current_streak}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </Card>

          <Card style={{ gap: 12 }}>
            <CardHeader title="Upcoming reminders" action="Calendar" onAction={() => nav.navigate("Calendar")} />
            {data.upcoming_reminders.length === 0 ? (
              <T variant="small" muted>No upcoming reminders.</T>
            ) : (
              data.upcoming_reminders.map((r) => (
                <Row key={r.id} gap={12}>
                  <IconTile name="bell" color={c.accent} size={34} />
                  <View style={{ flex: 1 }}>
                    <T numberOfLines={1}>{r.title}</T>
                    <T variant="caption" muted>{friendlyDateTime(r.remind_at)}</T>
                  </View>
                </Row>
              ))
            )}
          </Card>

          <Card style={{ gap: 14 }}>
            <CardHeader title="This week" />
            <BarChart
              labels={data.week.map((d) => format(parseDateOnly(d.date), "EEEEE"))}
              series={[
                { name: "Tasks done", color: c.primary, values: data.week.map((d) => d.tasks_completed) },
                { name: "Habit check-ins", color: c.success, values: data.week.map((d) => d.habit_checkins) },
              ]}
              height={110}
            />
            <Row gap={10}>
              <MiniStat label="Tasks this month" value={String(data.month_summary.tasks_completed)} />
              <MiniStat label="Check-ins" value={String(data.month_summary.habit_checkins)} />
              <MiniStat label="Income" value={formatMoney(data.month_summary.income, data.finance.currency, true)} />
            </Row>
          </Card>

          {data.recent_activity.length ? (
            <Card style={{ gap: 12 }}>
              <CardHeader title="Recent activity" action="History" onAction={() => nav.navigate("History")} />
              {data.recent_activity.map((a) => (
                <Row key={a.id} gap={10}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />
                  <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{a.description}</T>
                  <T variant="caption" muted>{timeAgo(a.created_at)}</T>
                </Row>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <TaskForm visible={sheet === "task"} onClose={() => setSheet(null)} defaultDue={new Date(new Date().setHours(18, 0, 0, 0))} />
      <TransactionForm visible={sheet === "expense"} onClose={() => setSheet(null)} />
      <HabitForm visible={sheet === "habit"} onClose={() => setSheet(null)} />
      <ReminderForm visible={sheet === "reminder"} onClose={() => setSheet(null)} />
    </Screen>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.muted, borderRadius: 12, padding: 10 }}>
      <T variant="h3" numberOfLines={1} adjustsFontSizeToFit>{value}</T>
      <T variant="caption" muted numberOfLines={1}>{label}</T>
    </View>
  );
}
