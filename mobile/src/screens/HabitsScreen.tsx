import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import * as React from "react";
import { Pressable, View } from "react-native";

import { api } from "../api";
import { Ring } from "../charts";
import { HabitForm, habitIcon } from "../forms";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { Habit, HabitOverview } from "../types";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Fab,
  Icon,
  IconButton,
  IconTile,
  Loading,
  Row,
  Screen,
  Segmented,
  Sheet,
  T,
  confirm,
  errorMessage,
  toast,
} from "../ui";
import { alpha, parseDateOnly, toISODate } from "../utils";

export function HabitsScreen() {
  const c = useColors();
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  const [form, setForm] = React.useState<{ open: boolean; habit?: Habit | null }>({ open: false });
  const [detail, setDetail] = React.useState<Habit | null>(null);
  const overview = useQuery<HabitOverview>("/api/habits/overview?days=84");
  const list = useQuery<Habit[]>(`/api/habits?include_archived=${tab === "archived"}`);
  const habits = (list.data ?? []).filter((h) => (tab === "archived" ? h.archived : !h.archived));

  async function toggle(h: Habit) {
    try {
      const updated = await api<Habit>(`/api/habits/${h.id}/toggle`, { method: "POST", json: {} });
      if (list.data) list.mutate(list.data.map((x) => (x.id === h.id ? updated : x)));
      const done = updated.frequency === "daily" ? updated.done_today : updated.done_this_week;
      if (done) toast(updated.current_streak > 1 ? `🔥 ${updated.current_streak} streak!` : "Checked in ✓");
    } catch (e) {
      toast(errorMessage(e));
    }
    invalidate("/api/habits/overview", "/api/dashboard", "/api/activity");
  }

  const o = overview.data;
  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Habits"
        subtitle="Build consistency, one day at a time"
        refreshing={list.refreshing}
        onRefresh={() => {
          list.refresh();
          overview.refresh();
        }}
      >
        {o && tab === "active" ? (
          <Card style={{ gap: 16 }}>
            <Row gap={16}>
              <Ring value={o.progress} size={76} stroke={8} color={c.success}>
                <T variant="h3">{Math.round(o.progress)}%</T>
              </Ring>
              <View style={{ flex: 1, gap: 4 }}>
                <T variant="h3">{o.done_today} of {o.due_today} done</T>
                <T variant="small" muted>Best streak {o.best_streak} · avg completion {Math.round(o.average_completion)}%</T>
              </View>
            </Row>
            <Heatmap data={o.calendar} />
          </Card>
        ) : null}

        <Segmented
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
          ]}
          value={tab}
          onChange={setTab}
        />

        {list.error && !list.data ? <ErrorBox error={list.error} onRetry={list.refresh} /> : null}
        {list.loading ? <Loading /> : null}
        {list.data && habits.length === 0 ? (
          tab === "active" ? (
            <Empty icon="target" title="Start a habit" text="Reading, exercise, water, sleep — track anything you want to do regularly." action="New habit" onAction={() => setForm({ open: true, habit: null })} />
          ) : (
            <Empty icon="archive" title="Nothing archived" />
          )
        ) : null}

        {habits.map((h) => {
          const done = h.frequency === "daily" ? h.done_today : h.done_this_week;
          return (
            <Card key={h.id} style={{ padding: 14, gap: 12 }} onPress={() => setDetail(h)}>
              <Row gap={12}>
                <IconTile name={habitIcon(h.icon)} color={h.color} size={44} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T weight="700" numberOfLines={1}>{h.name}</T>
                  <Row gap={6}>
                    <Badge label={h.frequency === "daily" ? "Daily" : "Weekly"} color={h.color} />
                    <T variant="caption" muted>🔥 {h.current_streak} · best {h.best_streak} · {Math.round(h.completion_rate)}%</T>
                  </Row>
                </View>
                {!h.archived ? (
                  <Pressable
                    onPress={() => toggle(h)}
                    hitSlop={8}
                    style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: done ? h.color : alpha(h.color, 0.12), borderWidth: 2, borderColor: h.color }}
                  >
                    <Icon name="check" size={22} color={done ? "#fff" : h.color} />
                  </Pressable>
                ) : null}
              </Row>
              <WeekDots habit={h} />
            </Card>
          );
        })}
      </Screen>
      {tab === "active" ? <Fab onPress={() => setForm({ open: true, habit: null })} /> : null}
      <HabitForm visible={form.open} habit={form.habit} onClose={() => setForm({ open: false })} />
      <HabitDetail
        habit={detail}
        onClose={() => setDetail(null)}
        onEdit={(h) => {
          setDetail(null);
          setForm({ open: true, habit: h });
        }}
      />
    </View>
  );
}

function WeekDots({ habit }: { habit: Habit }) {
  const c = useColors();
  const logs = new Set(habit.recent_logs);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <Row style={{ justifyContent: "space-between" }}>
      {days.map((d) => {
        const on = logs.has(toISODate(d));
        return (
          <View key={d.toISOString()} style={{ alignItems: "center", gap: 4 }}>
            <T variant="caption" muted style={{ fontSize: 10 }}>{format(d, "EEEEE")}</T>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: on ? habit.color : c.muted, alignItems: "center", justifyContent: "center", borderWidth: isToday(d) ? 2 : 0, borderColor: alpha(habit.color, 0.6) }}>
              {on ? <Icon name="check" size={13} color="#fff" /> : null}
            </View>
          </View>
        );
      })}
    </Row>
  );
}

function Heatmap({ data }: { data: { date: string; count: number }[] }) {
  const c = useColors();
  const max = Math.max(1, ...data.map((d) => d.count));
  // Columns are weeks (Mon-Sun), oldest left.
  const first = parseDateOnly(data[0]?.date ?? toISODate());
  const pad = (first.getDay() + 6) % 7;
  const cells: ({ date: string; count: number } | null)[] = [...Array(pad).fill(null), ...data];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 3 }}>
        {weeks.map((w, i) => (
          <View key={i} style={{ flex: 1, gap: 3 }}>
            {Array.from({ length: 7 }, (_, j) => {
              const cell = w[j];
              const v = cell ? cell.count / max : 0;
              return (
                <View
                  key={j}
                  style={{ aspectRatio: 1, borderRadius: 3, backgroundColor: !cell ? "transparent" : cell.count ? alpha(c.success, 0.25 + v * 0.75) : c.muted }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <T variant="caption" muted>Check-ins over the last 12 weeks</T>
    </View>
  );
}

function HabitDetail({ habit, onClose, onEdit }: { habit: Habit | null; onClose: () => void; onEdit: (h: Habit) => void }) {
  const c = useColors();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [current, setCurrent] = React.useState<Habit | null>(habit);
  React.useEffect(() => {
    setCurrent(habit);
    setMonth(startOfMonth(new Date()));
  }, [habit]);

  const path = habit ? `/api/habits/${habit.id}/logs?start=${toISODate(startOfMonth(month))}&end=${toISODate(endOfMonth(month))}` : null;
  const logs = useQuery<string[]>(path);
  const set = new Set(logs.data ?? []);
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const h = current;

  async function toggleDay(d: Date) {
    if (!h || isAfter(d, new Date())) return;
    try {
      const updated = await api<Habit>(`/api/habits/${h.id}/toggle`, { method: "POST", json: { date: toISODate(d) } });
      setCurrent(updated);
      logs.refresh();
      invalidate("/api/habits", "/api/dashboard", "/api/activity");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function archive() {
    if (!h) return;
    await api(`/api/habits/${h.id}`, { method: "PATCH", json: { archived: !h.archived } }).catch((e) => toast(errorMessage(e)));
    invalidate("/api/habits", "/api/dashboard");
    toast(h.archived ? "Habit restored" : "Habit archived");
    onClose();
  }

  async function remove() {
    if (!h || !(await confirm("Delete habit?", `“${h.name}” and its whole history will be deleted.`))) return;
    await api(`/api/habits/${h.id}`, { method: "DELETE" }).catch((e) => toast(errorMessage(e)));
    invalidate("/api/habits", "/api/dashboard", "/api/activity");
    onClose();
  }

  return (
    <Sheet visible={!!habit} onClose={onClose} title={h?.name ?? ""}>
      {h ? (
        <>
          <Row gap={10}>
            <StatBox label="Current streak" value={`🔥 ${h.current_streak}`} />
            <StatBox label="Best streak" value={String(h.best_streak)} />
            <StatBox label={h.frequency === "daily" ? "Last 30 days" : "Last 12 weeks"} value={`${Math.round(h.completion_rate)}%`} />
          </Row>
          {h.description ? <T variant="small" muted>{h.description}</T> : null}
          <Card style={{ gap: 10 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <IconButton name="chevron-left" onPress={() => setMonth(addMonths(month, -1))} />
              <T variant="h3">{format(month, "MMMM yyyy")}</T>
              <IconButton name="chevron-right" onPress={() => setMonth(addMonths(month, 1))} />
            </Row>
            <View style={{ flexDirection: "row" }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <T key={i} variant="caption" muted style={{ flex: 1, textAlign: "center" }}>{d}</T>
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {days.map((d) => {
                const on = set.has(toISODate(d));
                const future = isAfter(d, new Date());
                return (
                  <Pressable key={d.toISOString()} onPress={() => toggleDay(d)} disabled={future} style={{ width: `${100 / 7}%`, padding: 3 }}>
                    <View
                      style={{
                        aspectRatio: 1,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: on ? h.color : "transparent",
                        borderWidth: isToday(d) ? 2 : 0,
                        borderColor: h.color,
                        opacity: !isSameMonth(d, month) ? 0.3 : future ? 0.4 : 1,
                      }}
                    >
                      <T variant="small" weight={on ? "700" : "400"} color={on ? "#fff" : c.foreground}>{format(d, "d")}</T>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <T variant="caption" muted>Tap a past day to mark or unmark it.</T>
          </Card>
          <Row gap={10}>
            <Button title="Edit" icon="edit-2" variant="secondary" style={{ flex: 1 }} onPress={() => onEdit(h)} />
            <Button title={h.archived ? "Restore" : "Archive"} icon="archive" variant="outline" style={{ flex: 1 }} onPress={archive} />
          </Row>
          <Button title="Delete habit" icon="trash-2" variant="ghost" onPress={remove} />
        </>
      ) : null}
    </Sheet>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: c.border }}>
      <T variant="h3">{value}</T>
      <T variant="caption" muted numberOfLines={1}>{label}</T>
    </View>
  );
}
