import { useNavigation } from "@react-navigation/native";
import { format } from "date-fns/format";
import { isToday } from "date-fns/isToday";
import { isTomorrow } from "date-fns/isTomorrow";
import * as React from "react";
import { Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";

import { api } from "../api";
import { useUser } from "../auth";
import { HabitForm, ReminderForm, TaskForm, TransactionForm } from "../forms";
import { Glyph, type GlyphName, habitGlyph } from "../icons";
import { invalidate, useQuery } from "../query";
import { type Colors, LIGHT_COLORS, useColors, useIsDark } from "../theme";
import type { Dashboard, Habit, Reminder, Task } from "../types";
import { Avatar, ErrorBox, Loading, Screen, errorMessage, toast } from "../ui";
import { formatMoney, greeting, parseDateOnly, timeAgo } from "../utils";

/* Home — black & white. One dark "focus" card carries today's state; everything else sits on
   white surfaces with hairline borders, so the eye goes to numbers, not decoration. */

/* Theme-aware palette. "ink" is the strongest colour (black in light mode, white in dark);
   "onInk" is what sits on top of it. Set once per render of the screen (see usePalette). */
function palette(c: Colors, dark: boolean) {
  return {
    ink: c.foreground,
    ink2: dark ? "#E5E5E5" : "#262626",
    sub: c.mutedForeground,
    faint: dark ? "#737373" : "#A3A3A3",
    line: c.border,
    wash: c.muted,
    card: c.card,
    bg: c.background,
    danger: c.danger,
    strong: dark ? "#404040" : "#D4D4D4",
    chart2: dark ? "#525252" : "#CFCFCF",
    pressed: dark ? "#1A1A1A" : "#FBFBFB",
    onInk: dark ? "#0A0A0A" : "#FFFFFF",
    onInkSub: dark ? "#6B6B6B" : "#8C8C8C",
    onInkMuted: dark ? "#525252" : "#A3A3A3",
    onInkSoft: dark ? "#404040" : "#D4D4D4",
    onInkA: (a: number) => (dark ? `rgba(10,10,10,${a})` : `rgba(255,255,255,${a})`),
  };
}

let K = palette(LIGHT_COLORS, false);
let s = makeStyles(K);
let lastScheme: boolean | null = null;

/** Point K and s at the current theme. Children render in the same pass, so they see it too. */
function usePalette() {
  const c = useColors();
  const dark = useIsDark();
  if (lastScheme !== dark) {
    K = palette(c, dark);
    s = makeStyles(K);
    lastScheme = dark;
  }
}


const PAD = 20;

type Sheet = null | "task" | "expense" | "habit" | "reminder";

export function DashboardScreen() {
  usePalette();
  const user = useUser();
  const nav = useNavigation<any>();
  const { data, error, loading, refreshing, refresh, mutate } = useQuery<Dashboard>("/api/dashboard");
  const [sheet, setSheet] = React.useState<Sheet>(null);

  async function toggleTask(id: number, completed: boolean) {
    if (data) mutate({ ...data, today_tasks: data.today_tasks.map((t) => (t.id === id ? { ...t, completed } : t)) });
    try {
      await api(`/api/tasks/${id}`, { method: "PATCH", json: { completed } });
    } catch (e) {
      toast(errorMessage(e));
    }
    invalidate("/api/dashboard", "/api/tasks", "/api/activity");
  }

  async function toggleHabit(h: Habit) {
    if (data) {
      const flip = (x: Habit) =>
        x.id === h.id ? { ...x, done_today: !x.done_today, done_this_week: x.frequency === "weekly" ? !x.done_this_week : x.done_this_week } : x;
      mutate({ ...data, habits: { ...data.habits, items: data.habits.items.map(flip) } });
    }
    try {
      await api(`/api/habits/${h.id}/toggle`, { method: "POST", json: {} });
    } catch (e) {
      toast(errorMessage(e));
    }
    invalidate("/api/dashboard", "/api/habits", "/api/activity");
  }

  const name = (data?.user.name || user.name).split(" ")[0];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} padded={false}>
      <View style={{ paddingHorizontal: PAD, paddingTop: 14, gap: 28 }}>
        {/* ------------------------------------------------ header */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1 }}>
            {/* One line: shrinks to fit rather than wrapping onto a second line. */}
            <Text style={{ fontSize: 28, lineHeight: 33, letterSpacing: -0.8 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              <Text style={{ color: K.faint, fontWeight: "600" }}>{greeting()}, </Text>
              <Text style={{ color: K.ink, fontWeight: "800" }}>{name}</Text>
            </Text>
            <Text style={[s.eyebrow, { marginTop: 4 }]}>{format(new Date(), "EEEE · d MMMM").toUpperCase()}</Text>
          </View>
          <RoundButton onPress={() => nav.navigate("Calendar")} label="Reminders">
            <Glyph name="bell" size={21} />
            {data?.upcoming_reminders.length ? <View style={s.dot} /> : null}
          </RoundButton>
          <Pressable onPress={() => nav.navigate("Settings")} accessibilityLabel="Settings" style={{ borderRadius: 24, borderWidth: 1, borderColor: K.line, padding: 2 }}>
            <Avatar name={data?.user.name || user.name} url={data?.user.avatar_url ?? user.avatar_url} size={40} />
          </Pressable>
        </View>

        {error && !data ? <ErrorBox error={error} onRetry={refresh} /> : null}
        {loading && !data ? <Loading /> : null}

        {data ? (
          <>
            <FocusCard data={data} onOpenMoney={() => nav.navigate("Money")} />

            {/* ------------------------------------------------ quick add */}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <QuickAction icon="check-square" label="Task" onPress={() => setSheet("task")} />
              <QuickAction icon="receipt" label="Expense" onPress={() => setSheet("expense")} />
              <QuickAction icon="bell-ringing" label="Reminder" onPress={() => setSheet("reminder")} />
              <QuickAction icon="note-pencil" label="Note" onPress={() => nav.navigate("NoteEditor", { id: null })} />
            </View>

            <MoneyCard data={data} onOpen={() => nav.navigate("Money")} />

            {/* ------------------------------------------------ today's tasks */}
            <View>
              <SectionHeader
                title="Today"
                meta={data.today_tasks.length ? `${data.today_tasks.filter((t) => t.completed).length} of ${data.today_tasks.length} done` : undefined}
                action="All tasks"
                onAction={() => nav.navigate("Tasks")}
              />
              {data.today_tasks.length === 0 ? (
                <EmptyState icon="seal-check" title="A clear day" text="Nothing is due today." action="Plan a task" onAction={() => setSheet("task")} />
              ) : (
                <Surface style={{ paddingVertical: 4 }}>
                  {data.today_tasks.map((t, i) => (
                    <TaskRow key={t.id} task={t} first={i === 0} onToggle={() => toggleTask(t.id, !t.completed)} />
                  ))}
                </Surface>
              )}
            </View>

            {/* ------------------------------------------------ habits */}
            <View>
              <SectionHeader
                title="Habits"
                meta={data.habits.total ? `${data.habits.done} of ${data.habits.total} today` : undefined}
                action="Open"
                onAction={() => nav.navigate("Habits")}
              />
              {data.habits.items.length === 0 ? (
                <EmptyState icon="target" title="Start a streak" text="Small daily wins add up." action="New habit" onAction={() => setSheet("habit")} />
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -PAD }}
                  contentContainerStyle={{ paddingHorizontal: PAD, gap: 10 }}
                >
                  {data.habits.items.map((h) => (
                    <HabitTile key={h.id} habit={h} onPress={() => toggleHabit(h)} />
                  ))}
                  <Pressable onPress={() => setSheet("habit")} style={({ pressed }) => [s.habitTile, s.habitAdd, pressed && { opacity: 0.6 }]}>
                    <Glyph name="plus" size={22} weight="bold" color={K.sub} />
                    <Text style={{ color: K.sub, fontSize: 13, fontWeight: "600" }}>New habit</Text>
                  </Pressable>
                </ScrollView>
              )}
            </View>

            {/* ------------------------------------------------ up next */}
            <View>
              <SectionHeader title="Up next" action="Calendar" onAction={() => nav.navigate("Calendar")} />
              {data.upcoming_reminders.length === 0 ? (
                <EmptyState icon="calendar" title="No reminders ahead" text="Set one so nothing slips." action="Add reminder" onAction={() => setSheet("reminder")} />
              ) : (
                <Surface style={{ paddingVertical: 8 }}>
                  {data.upcoming_reminders.slice(0, 4).map((r, i, arr) => (
                    <ReminderRow key={`${r.id}-${r.remind_at}`} reminder={r} last={i === arr.length - 1} />
                  ))}
                </Surface>
              )}
            </View>

            <WeekCard data={data} />

            {/* ------------------------------------------------ more */}
            <View>
              <SectionHeader title="More" />
              <Surface style={{ paddingVertical: 4 }}>
                <LinkRow icon="notebook" title="Notes" text="Ideas, lists and journals" onPress={() => nav.navigate("Notes")} first />
                <LinkRow icon="chart" title="History & reports" text="Weekly and monthly insights" onPress={() => nav.navigate("History")} />
                <LinkRow icon="gear" title="Settings" text="Profile, currency, security" onPress={() => nav.navigate("Settings")} />
              </Surface>
            </View>

            {data.recent_activity.length ? (
              <View>
                <SectionHeader title="Activity" action="History" onAction={() => nav.navigate("History")} />
                <View style={{ gap: 14, paddingHorizontal: 2 }}>
                  {data.recent_activity.slice(0, 5).map((a) => (
                    <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: K.ink }} />
                      <Text style={{ flex: 1, color: K.ink2, fontSize: 14 }} numberOfLines={1}>{a.description}</Text>
                      <Text style={{ color: K.faint, fontSize: 12, fontVariant: ["tabular-nums"] }}>{timeAgo(a.created_at)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <TaskForm visible={sheet === "task"} onClose={() => setSheet(null)} defaultDue={new Date(new Date().setHours(18, 0, 0, 0))} />
      <TransactionForm visible={sheet === "expense"} onClose={() => setSheet(null)} />
      <HabitForm visible={sheet === "habit"} onClose={() => setSheet(null)} />
      <ReminderForm visible={sheet === "reminder"} onClose={() => setSheet(null)} />
    </Screen>
  );
}

// ================================================================ focus card

/** The one dark card: money first (balance + today's spending), today's tasks as a strip below. */
function FocusCard({ data, onOpenMoney }: { data: Dashboard; onOpenMoney: () => void }) {
  const f = data.finance;
  const negative = f.month_balance < 0;
  return (
    <View style={s.focus}>
      {/* ---- balance */}
      <Pressable onPress={onOpenMoney} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[s.eyebrow, { color: K.onInkSub }]}>CURRENT BALANCE · {format(new Date(), "MMM").toUpperCase()}</Text>
          <View style={s.focusChip}>
            <Glyph name="wallet" size={14} color={K.onInk} weight="bold" />
            <Text style={{ color: K.onInk, fontSize: 12, fontWeight: "700" }}>Money</Text>
            <Glyph name="caret-right" size={11} color={K.onInk} weight="bold" />
          </View>
        </View>
        <Text
          style={{
            color: negative ? "#FF6B5E" : K.onInk,
            fontSize: 46,
            lineHeight: 54,
            fontWeight: "800",
            letterSpacing: -1.8,
            marginTop: 14,
            fontVariant: ["tabular-nums"],
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(f.month_balance, f.currency)}
        </Text>
        <Text style={{ color: K.onInkSub, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
          {formatMoney(f.month_expense, f.currency, true)} spent so far this month
        </Text>
      </Pressable>

      {/* ---- today's spending + this month's income */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
        <TodayMoney icon="arrow-out" label="Spent today" value={formatMoney(f.today_expense, f.currency)} strong />
        <TodayMoney icon="arrow-in" label={`Earned in ${format(new Date(), "MMM")}`} value={formatMoney(f.month_income, f.currency)} />
      </View>
    </View>
  );
}

function TodayMoney({ icon, label, value, strong }: { icon: GlyphName; label: string; value: string; strong?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        borderRadius: 18,
        backgroundColor: strong ? K.onInk : K.onInkA(0.08),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: strong ? K.ink : K.onInkA(0.12),
          }}
        >
          <Glyph name={icon} size={13} color={K.onInk} weight="bold" />
        </View>
        <Text style={{ color: strong ? K.sub : K.onInkMuted, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      </View>
      <Text
        style={{ color: strong ? K.ink : K.onInk, fontSize: 22, fontWeight: "800", letterSpacing: -0.6, marginTop: 10, fontVariant: ["tabular-nums"] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

// ================================================================ quick actions

function QuickAction({ icon, label, onPress }: { icon: GlyphName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`New ${label.toLowerCase()}`} style={{ alignItems: "center", gap: 8, width: 72 }}>
      {({ pressed }) => (
        <>
          <View style={[s.quick, pressed && { backgroundColor: K.wash, transform: [{ scale: 0.96 }] }]}>
            <Glyph name={icon} size={26} />
            <View style={s.quickPlus}>
              <Glyph name="plus" size={9} color={K.onInk} weight="bold" />
            </View>
          </View>
          <Text style={{ color: K.ink2, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ================================================================ money

function MoneyCard({ data, onOpen }: { data: Dashboard; onOpen: () => void }) {
  const f = data.finance;
  const budget = f.budget;
  const pct = budget && budget.amount > 0 ? budget.spent / budget.amount : 0;
  const over = pct > 1;
  return (
    <Surface style={{ padding: 20 }} onPress={onOpen}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Glyph name="wallet" size={20} />
          <Text style={{ color: K.ink, fontSize: 15, fontWeight: "700" }}>Money</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ color: K.sub, fontSize: 13, fontWeight: "600" }}>{format(new Date(), "MMMM")}</Text>
          <Glyph name="caret-right" size={14} color={K.sub} weight="bold" />
        </View>
      </View>

      {/* The balance is the headline of the dark card above; here, where the money went. */}
      <Text style={{ color: K.sub, fontSize: 12, fontWeight: "600", marginTop: 18, letterSpacing: 0.3 }}>Spent this month</Text>
      <Text
        style={{ color: K.ink, fontSize: 34, fontWeight: "800", letterSpacing: -1.2, marginTop: 2, fontVariant: ["tabular-nums"] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatMoney(f.month_expense, f.currency)}
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Flow icon="arrow-in" label="Income" value={formatMoney(f.month_income, f.currency, true)} />
        <Flow icon="chart" label="Daily average" value={formatMoney(f.month_expense / new Date().getDate(), f.currency, true)} />
      </View>

      {budget ? (
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: K.sub, fontSize: 12, fontWeight: "600" }}>
              Budget · {formatMoney(budget.spent, f.currency, true)} of {formatMoney(budget.amount, f.currency, true)}
            </Text>
            <Text style={{ color: over ? K.danger : K.ink, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{Math.round(pct * 100)}%</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: K.wash, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, pct * 100)}%`, height: "100%", borderRadius: 3, backgroundColor: over ? K.danger : K.ink }} />
          </View>
        </View>
      ) : null}
    </Surface>
  );
}

function Flow({ icon, label, value }: { icon: GlyphName; label: string; value: string }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: K.wash }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: K.card, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={16} weight="bold" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: K.sub, fontSize: 11, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: K.ink, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

// ================================================================ tasks

function TaskRow({ task, first, onToggle }: { task: Task; first: boolean; onToggle: () => void }) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const late = !!due && !task.completed && due < new Date();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.completed }}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
        !first && { borderTopWidth: 1, borderTopColor: K.line },
        pressed && { backgroundColor: K.pressed },
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          borderWidth: task.completed ? 0 : 1.5,
          borderColor: K.strong,
          backgroundColor: task.completed ? K.ink : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {task.completed ? <Glyph name="check" size={14} color={K.onInk} weight="bold" /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: task.completed ? K.faint : K.ink, fontSize: 15, fontWeight: "600", textDecorationLine: task.completed ? "line-through" : "none" }}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {task.category ? <Text style={{ color: K.faint, fontSize: 12, marginTop: 2 }}>{task.category.name}</Text> : null}
      </View>
      {task.priority === "high" && !task.completed ? (
        <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: K.ink }}>
          <Text style={{ color: K.onInk, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>HIGH</Text>
        </View>
      ) : null}
      {due ? (
        <Text style={{ color: late ? K.danger : K.sub, fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{format(due, "h:mm a")}</Text>
      ) : null}
    </Pressable>
  );
}

// ================================================================ habits

function HabitTile({ habit, onPress }: { habit: Habit; onPress: () => void }) {
  const done = habit.frequency === "daily" ? habit.done_today : habit.done_this_week;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={habit.name}
      style={({ pressed }) => [s.habitTile, done && { backgroundColor: K.ink, borderColor: K.ink }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: done ? K.onInkA(0.12) : K.wash,
          }}
        >
          <Glyph name={habitGlyph(habit.icon)} size={22} color={done ? K.onInk : K.ink} />
        </View>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: done ? K.onInk : "transparent",
            borderWidth: done ? 0 : 1.5,
            borderColor: K.strong,
          }}
        >
          {done ? <Glyph name="check" size={12} color={K.ink} weight="bold" /> : null}
        </View>
      </View>
      <Text style={{ color: done ? K.onInk : K.ink, fontSize: 14, fontWeight: "700", marginTop: 14 }} numberOfLines={1}>
        {habit.name}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
        <Glyph name="flame" size={14} color={done ? K.onInk : K.sub} weight={habit.current_streak ? "fill" : "regular"} />
        <Text style={{ color: done ? K.onInkMuted : K.sub, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
          {habit.current_streak} {habit.frequency === "daily" ? "day" : "week"}
          {habit.current_streak === 1 ? "" : "s"}
        </Text>
      </View>
    </Pressable>
  );
}

// ================================================================ reminders

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE d");
}

function ReminderRow({ reminder, last }: { reminder: Reminder; last: boolean }) {
  const at = new Date(reminder.remind_at);
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16 }}>
      <View style={{ width: 64, paddingVertical: 10 }}>
        <Text style={{ color: K.ink, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{format(at, "h:mm")}</Text>
        <Text style={{ color: K.faint, fontSize: 11, fontWeight: "600" }}>
          {format(at, "a")} · {dayLabel(at)}
        </Text>
      </View>
      <View style={{ width: 20, alignItems: "center" }}>
        <View style={{ width: 1, flex: 1, backgroundColor: K.line }} />
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 2, borderColor: K.ink, backgroundColor: K.card, position: "absolute", top: 16 }} />
        {last ? <View style={{ position: "absolute", top: 26, bottom: 0, width: 3, backgroundColor: K.card }} /> : null}
      </View>
      <View style={{ flex: 1, paddingVertical: 10, paddingLeft: 10, justifyContent: "center" }}>
        <Text style={{ color: K.ink, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{reminder.title}</Text>
        {reminder.recurrence && reminder.recurrence !== "none" ? (
          <Text style={{ color: K.faint, fontSize: 12, marginTop: 2 }}>Repeats {reminder.recurrence}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ================================================================ week

function WeekCard({ data }: { data: Dashboard }) {
  const days = data.week;
  const max = Math.max(1, ...days.map((d) => d.tasks_completed + d.habit_checkins));
  const H = 96;
  return (
    <Surface style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: K.ink, fontSize: 15, fontWeight: "700" }}>This week</Text>
          <Text style={{ color: K.sub, fontSize: 12, marginTop: 2 }}>Tasks completed and habit check-ins</Text>
        </View>
        <View style={{ gap: 4 }}>
          <Legend swatch={K.ink} label="Tasks" />
          <Legend swatch={K.chart2} label="Habits" />
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: H + 22, marginTop: 18 }}>
        {days.map((d) => {
          const date = parseDateOnly(d.date);
          const today = isToday(date);
          const tasksH = (d.tasks_completed / max) * H;
          const habitsH = (d.habit_checkins / max) * H;
          return (
            <View key={d.date} style={{ flex: 1, alignItems: "center", gap: 6 }}>
              <View style={{ height: H, width: "100%", justifyContent: "flex-end", alignItems: "center" }}>
                <View style={{ width: "72%", borderRadius: 6, overflow: "hidden", backgroundColor: K.wash, height: H, justifyContent: "flex-end" }}>
                  <View style={{ height: habitsH, backgroundColor: K.chart2 }} />
                  <View style={{ height: tasksH, backgroundColor: K.ink }} />
                </View>
              </View>
              <Text style={{ color: today ? K.ink : K.faint, fontSize: 11, fontWeight: today ? "800" : "600" }}>{format(date, "EEEEE")}</Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: K.line }}>
        <MonthStat label="Tasks this month" value={String(data.month_summary.tasks_completed)} />
        <MonthStat label="Check-ins" value={String(data.month_summary.habit_checkins)} />
        <MonthStat label="Spent" value={formatMoney(data.month_summary.expense, data.finance.currency, true)} />
      </View>
    </Surface>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: swatch }} />
      <Text style={{ color: K.sub, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function MonthStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: K.ink, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ color: K.sub, fontSize: 11, fontWeight: "600", marginTop: 2 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ================================================================ shared bits

function Surface({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.surface, style, pressed && { backgroundColor: K.pressed }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.surface, style]}>{children}</View>;
}

function SectionHeader({ title, meta, action, onAction }: { title: string; meta?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ color: K.ink, fontSize: 20, fontWeight: "800", letterSpacing: -0.4 }}>{title}</Text>
        {meta ? <Text style={{ color: K.faint, fontSize: 13, fontWeight: "600" }}>{meta}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ color: K.sub, fontSize: 13, fontWeight: "600" }}>{action}</Text>
          <Glyph name="caret-right" size={13} color={K.sub} weight="bold" />
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState({ icon, title, text, action, onAction }: { icon: GlyphName; title: string; text: string; action: string; onAction: () => void }) {
  return (
    <View style={[s.surface, { borderStyle: "dashed", borderColor: K.strong, flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }]}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: K.wash, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={26} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: K.ink, fontSize: 15, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: K.sub, fontSize: 13, marginTop: 2 }}>{text}</Text>
      </View>
      <Pressable onPress={onAction} style={({ pressed }) => ({ paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: K.ink, justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ color: K.onInk, fontSize: 12, fontWeight: "700" }}>{action}</Text>
      </Pressable>
    </View>
  );
}

function LinkRow({ icon, title, text, onPress, first }: { icon: GlyphName; title: string; text: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
        !first && { borderTopWidth: 1, borderTopColor: K.line },
        pressed && { backgroundColor: K.pressed },
      ]}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: K.wash, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: K.ink, fontSize: 15, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: K.sub, fontSize: 12, marginTop: 1 }}>{text}</Text>
      </View>
      <Glyph name="caret-right" size={16} color={K.faint} weight="bold" />
    </Pressable>
  );
}

function RoundButton({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: K.line,
        backgroundColor: pressed ? K.wash : K.card,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      {children}
    </Pressable>
  );
}

function makeStyles(K: ReturnType<typeof palette>) {
  return {
  eyebrow: { color: K.sub, fontSize: 11, fontWeight: "700", letterSpacing: 1.4 },
  dot: { position: "absolute", top: 11, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: K.ink, borderWidth: 1.5, borderColor: K.card },
  focus: { backgroundColor: K.ink, borderRadius: 28, padding: 22 },
  focusChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: K.onInkA(0.1) },
  quick: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: K.line,
    backgroundColor: K.card,
    alignItems: "center",
    justifyContent: "center",
  },
  quickPlus: {
    position: "absolute",
    right: 9,
    bottom: 9,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: K.ink,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: K.card,
  },
  surface: { backgroundColor: K.card, borderRadius: 24, borderWidth: 1, borderColor: K.line, overflow: "hidden" },
  habitTile: { width: 140, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: K.line, backgroundColor: K.card },
  habitAdd: { borderStyle: "dashed", borderColor: K.strong, backgroundColor: "transparent", alignItems: "center", justifyContent: "center", gap: 8 },
  } as const;
}
