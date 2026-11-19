import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import * as React from "react";
import { Pressable, View } from "react-native";

import { api, qs } from "../api";
import { ReminderForm, TaskForm } from "../forms";
import { syncReminderNotifications } from "../notifications";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { Reminder, Task } from "../types";
import { Badge, Button, Card, CardHeader, Fab, Icon, IconButton, IconTile, MonthPicker, Row, Screen, Segmented, T, confirm, errorMessage, toast } from "../ui";
import { RECURRENCES, friendlyDateTime, toISODate } from "../utils";

export function CalendarScreen() {
  const c = useColors();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = React.useState(() => new Date());
  const [tab, setTab] = React.useState<"upcoming" | "overdue" | "completed">("upcoming");
  const [form, setForm] = React.useState<{ open: boolean; reminder?: Reminder | null; at?: Date }>({ open: false });
  const [taskForm, setTaskForm] = React.useState<{ open: boolean; task?: Task | null }>({ open: false });

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const range = { start: toISODate(gridStart), end: toISODate(gridEnd) };
  const reminders = useQuery<Reminder[]>(`/api/reminders${qs({ ...range, expand: true })}`);
  const tasks = useQuery<Task[]>(`/api/tasks${qs({ due_from: range.start, due_to: range.end })}`);
  const list = useQuery<Reminder[]>(`/api/reminders?status=${tab}&limit=30`);

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const remindersOn = (d: Date) => reminders.data?.filter((r) => isSameDay(new Date(r.remind_at), d)) ?? [];
  const tasksOn = (d: Date) => tasks.data?.filter((t) => t.due_date && isSameDay(new Date(t.due_date), d)) ?? [];

  function refreshAll() {
    reminders.refresh();
    tasks.refresh();
    list.refresh();
  }

  function newAt(d: Date) {
    const at = isToday(d) ? new Date(new Date().setMinutes(0, 0, 0) + 3600_000) : new Date(new Date(d).setHours(9, 0, 0, 0));
    setForm({ open: true, reminder: null, at });
  }

  const dayReminders = remindersOn(selected);
  const dayTasks = tasksOn(selected);

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Calendar" subtitle="Reminders & due tasks" refreshing={reminders.refreshing} onRefresh={refreshAll}>
        <Card style={{ gap: 10, padding: 12 }}>
          <MonthPicker
            value={month}
            onChange={(m) => {
              setMonth(m);
              // Select today when returning to the current month, otherwise the 1st.
              setSelected(isSameMonth(m, new Date()) ? new Date() : m);
            }}
          />
          <View style={{ flexDirection: "row" }}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <T key={d} variant="caption" muted style={{ flex: 1, textAlign: "center", fontWeight: "600" }}>{d.slice(0, 2)}</T>
            ))}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {days.map((d) => {
              const rs = remindersOn(d).length;
              const ts = tasksOn(d).length;
              const sel = isSameDay(d, selected);
              return (
                <Pressable key={d.toISOString()} onPress={() => setSelected(d)} onLongPress={() => newAt(d)} style={{ width: `${100 / 7}%`, padding: 2 }}>
                  <View style={{ height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: sel ? c.primarySoft : "transparent", borderWidth: sel ? 1.5 : 0, borderColor: c.primary, opacity: isSameMonth(d, month) ? 1 : 0.35 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: isToday(d) ? c.primary : "transparent" }}>
                      <T variant="small" weight="600" color={isToday(d) ? "#fff" : c.foreground}>{format(d, "d")}</T>
                    </View>
                    <Row gap={3} style={{ height: 6 }}>
                      {rs ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} /> : null}
                      {ts ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.primary }} /> : null}
                    </Row>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Row gap={14}>
            <Row gap={6}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} /><T variant="caption" muted>Reminders</T></Row>
            <Row gap={6}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} /><T variant="caption" muted>Tasks due</T></Row>
            <T variant="caption" muted style={{ marginLeft: "auto" }}>Long-press a day to add</T>
          </Row>
        </Card>

        <Card style={{ gap: 12 }}>
          <CardHeader title={format(selected, "EEEE, MMMM d")} action="+ Add" onAction={() => newAt(selected)} />
          {dayReminders.length === 0 && dayTasks.length === 0 ? <T variant="small" muted>Nothing scheduled for this day.</T> : null}
          {dayReminders.map((r) => (
            <ReminderRow key={`${r.id}-${r.remind_at}`} r={r} onEdit={() => setForm({ open: true, reminder: r })} onChanged={refreshAll} />
          ))}
          {dayTasks.map((t) => (
            <Pressable key={`t${t.id}`} onPress={() => setTaskForm({ open: true, task: t })}>
              <Row gap={12}>
                <IconTile name="check-square" color={c.primary} size={36} />
                <View style={{ flex: 1 }}>
                  <T weight="600" numberOfLines={1} style={t.completed ? { textDecorationLine: "line-through", color: c.mutedForeground } : null}>{t.title}</T>
                  <T variant="caption" muted>Task due · {format(new Date(t.due_date!), "h:mm a")}</T>
                </View>
              </Row>
            </Pressable>
          ))}
        </Card>

        <Segmented
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "overdue", label: "Overdue" },
            { value: "completed", label: "Completed" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <Card style={{ gap: 12 }}>
          {list.data && list.data.length === 0 ? <T variant="small" muted>No {tab} reminders.</T> : null}
          {list.data?.map((r) => (
            <ReminderRow key={r.id} r={r} onEdit={() => setForm({ open: true, reminder: r })} onChanged={refreshAll} showDate />
          ))}
          {!list.data && list.error ? <Button title="Retry" variant="outline" small onPress={list.refresh} /> : null}
        </Card>
      </Screen>
      <Fab onPress={() => newAt(selected)} />
      <ReminderForm visible={form.open} reminder={form.reminder} defaultAt={form.at} onClose={() => setForm({ open: false })} />
      <TaskForm visible={taskForm.open} task={taskForm.task} onClose={() => setTaskForm({ open: false })} />
    </View>
  );
}

function ReminderRow({ r, onEdit, onChanged, showDate }: { r: Reminder; onEdit: () => void; onChanged: () => void; showDate?: boolean }) {
  const c = useColors();
  const overdue = !r.completed && new Date(r.remind_at) < new Date();

  async function complete() {
    try {
      const res = await api<Reminder>(`/api/reminders/${r.id}/complete`, { method: "POST" });
      toast(res.completed ? "Reminder completed" : `Done! Next: ${friendlyDateTime(res.remind_at)}`);
    } catch (e) {
      toast(errorMessage(e));
    }
    after();
  }
  async function reopen() {
    await api(`/api/reminders/${r.id}`, { method: "PATCH", json: { completed: false } }).catch((e) => toast(errorMessage(e)));
    after();
  }
  async function remove() {
    if (!(await confirm("Delete reminder?", r.recurrence !== "none" ? `“${r.title}” and all its repeats will be deleted.` : `“${r.title}” will be deleted.`))) return;
    await api(`/api/reminders/${r.id}`, { method: "DELETE" }).catch((e) => toast(errorMessage(e)));
    after();
  }
  function after() {
    invalidate("/api/reminders", "/api/dashboard", "/api/activity");
    syncReminderNotifications();
    onChanged();
  }

  const color = r.completed ? c.success : overdue ? c.danger : c.accent;
  return (
    <Row gap={12} style={{ alignItems: "flex-start" }}>
      <IconTile name={r.completed ? "check" : overdue ? "alert-circle" : "bell"} color={color} size={36} />
      <Pressable onPress={onEdit} style={{ flex: 1, gap: 3 }}>
        <T weight="600" numberOfLines={1} style={r.completed ? { textDecorationLine: "line-through", color: c.mutedForeground } : null}>{r.title}</T>
        <T variant="caption" color={overdue ? c.danger : c.mutedForeground}>{showDate ? friendlyDateTime(r.remind_at) : format(new Date(r.remind_at), "h:mm a")}</T>
        {r.description ? <T variant="caption" muted numberOfLines={2}>{r.description}</T> : null}
        {r.recurrence !== "none" ? <Badge label={RECURRENCES.find((x) => x.value === r.recurrence)?.label ?? r.recurrence} color={c.accent} icon="repeat" /> : null}
      </Pressable>
      {r.completed ? (
        <IconButton name="rotate-ccw" onPress={reopen} label="Mark as not done" />
      ) : r.occurrence ? null : (
        <IconButton name="check" onPress={complete} color={c.success} bg={c.successSoft} label="Mark as done" />
      )}
      <Pressable onPress={remove} hitSlop={8} style={{ paddingTop: 10 }}>
        <Icon name="trash-2" size={17} color={c.mutedForeground} />
      </Pressable>
    </Row>
  );
}
