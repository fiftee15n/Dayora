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
import { Pressable, Text, View } from "react-native";

import { api } from "../api";
import { Ring } from "../charts";
import { HabitForm } from "../forms";
import { Glyph, habitGlyph } from "../icons";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { Habit, HabitOverview } from "../types";
import { Button, Card, Empty, ErrorBox, Fab, IconButton, Loading, Row, Screen, Segmented, Sheet, T, confirm, errorMessage, toast } from "../ui";
import { parseDateOnly, toISODate } from "../utils";

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
      if (done) toast(updated.current_streak > 1 ? `${updated.current_streak}-${updated.frequency === "daily" ? "day" : "week"} streak. Keep going!` : "Checked in");
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
          <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 18, gap: 18 }}>
            <Row gap={16}>
              <Ring value={o.progress} size={78} stroke={7} color={c.foreground}>
                <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{Math.round(o.progress)}%</Text>
              </Ring>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>TODAY</Text>
                <Text style={{ color: c.foreground, fontSize: 22, fontWeight: "800", letterSpacing: -0.5, marginTop: 2, fontVariant: ["tabular-nums"] }}>
                  {o.done_today} of {o.due_today} done
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
                  {o.due_today === 0 ? "Nothing due today" : o.done_today >= o.due_today ? "Every habit checked in" : `${o.due_today - o.done_today} left to check in`}
                </Text>
              </View>
            </Row>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 }}>
              <OverviewStat icon="flame" label="Best streak" value={String(o.best_streak)} />
              <OverviewStat icon="chart" label="Avg completion" value={`${Math.round(o.average_completion)}%`} last />
            </View>
            <Heatmap data={o.calendar} />
          </View>
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
            <Pressable
              key={h.id}
              onPress={() => setDetail(h)}
              style={({ pressed }) => ({
                backgroundColor: pressed ? c.muted : c.card,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: c.border,
                padding: 16,
                gap: 16,
                opacity: h.archived ? 0.75 : 1,
              })}
            >
              <Row gap={14}>
                <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                  <Glyph name={habitGlyph(h.icon)} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{h.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 5 }}>
                    <View style={{ paddingHorizontal: 8, height: 20, borderRadius: 10, borderWidth: 1, borderColor: c.border, justifyContent: "center" }}>
                      <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700" }}>{h.frequency === "daily" ? "Daily" : "Weekly"}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Glyph name="flame" size={14} weight={h.current_streak ? "fill" : "regular"} color={h.current_streak ? c.foreground : c.mutedForeground} />
                      <Text style={{ color: c.foreground, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{h.current_streak}</Text>
                    </View>
                    <Text style={{ flexShrink: 1, color: c.mutedForeground, fontSize: 12, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
                      Best {h.best_streak} · {Math.round(h.completion_rate)}%
                    </Text>
                  </View>
                </View>
                {!h.archived ? (
                  <Pressable
                    onPress={() => toggle(h)}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`Check in ${h.name}`}
                    style={({ pressed }) => ({
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: done ? c.foreground : "transparent",
                      borderWidth: done ? 0 : 1.5,
                      borderColor: c.input,
                      transform: [{ scale: pressed ? 0.92 : 1 }],
                    })}
                  >
                    <Glyph name="check" size={22} weight="bold" color={done ? c.background : c.mutedForeground} />
                  </Pressable>
                ) : (
                  <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: c.muted, justifyContent: "center" }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700" }}>Archived</Text>
                  </View>
                )}
              </Row>
              <WeekDots habit={h} />
            </Pressable>
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
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border }}>
      {days.map((d) => {
        const on = logs.has(toISODate(d));
        const today = isToday(d);
        return (
          <View key={d.toISOString()} style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: today ? c.foreground : c.mutedForeground, fontSize: 11, fontWeight: today ? "800" : "600" }}>{format(d, "EEEEE")}</Text>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                backgroundColor: on ? c.foreground : c.muted,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: today && !on ? 1.5 : 0,
                borderColor: c.foreground,
              }}
            >
              {on ? <Glyph name="check" size={13} weight="bold" color={c.background} /> : null}
            </View>
          </View>
        );
      })}
    </View>
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
                  style={{ aspectRatio: 1, borderRadius: 3, backgroundColor: c.foreground, opacity: !cell ? 0 : cell.count ? 0.3 + v * 0.7 : 0.07 }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Last 12 weeks</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 11 }}>Less</Text>
          {[0.07, 0.35, 0.6, 1].map((op) => (
            <View key={op} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c.foreground, opacity: op }} />
          ))}
          <Text style={{ color: c.mutedForeground, fontSize: 11 }}>More</Text>
        </View>
      </View>
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
            <StatBox label="Current streak" value={String(h.current_streak)} flame />
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
                        backgroundColor: on ? c.foreground : "transparent",
                        borderWidth: isToday(d) && !on ? 1.5 : 0,
                        borderColor: c.foreground,
                        opacity: !isSameMonth(d, month) ? 0.3 : future ? 0.4 : 1,
                      }}
                    >
                      <T variant="small" weight={on ? "800" : "500"} color={on ? c.background : c.foreground}>{format(d, "d")}</T>
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

function StatBox({ label, value, flame }: { label: string; value: string; flame?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: c.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {flame ? <Glyph name="flame" size={18} weight="fill" /> : null}
        <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
      </View>
      <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "600", marginTop: 2 }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function OverviewStat({ icon, label, value, last }: { icon: "flame" | "chart"; label: string; value: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, borderRightWidth: last ? 0 : 1, borderRightColor: c.border, marginRight: last ? 0 : 14 }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={18} weight="fill" />
      </View>
      <View>
        <Text style={{ color: c.foreground, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "600" }}>{label}</Text>
      </View>
    </View>
  );
}
