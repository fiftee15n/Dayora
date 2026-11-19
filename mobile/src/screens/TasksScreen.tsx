import * as React from "react";
import { Pressable, View } from "react-native";

import { api, qs } from "../api";
import { TaskForm } from "../forms";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { Task, TaskCategory } from "../types";
import { Badge, Card, Checkbox, Chips, Empty, ErrorBox, Fab, Icon, Input, Loading, Row, Screen, Segmented, T, confirm, errorMessage, toast } from "../ui";
import { friendlyDateTime } from "../utils";

type Status = "pending" | "today" | "upcoming" | "overdue" | "completed" | "all";

const STATUS: { value: Status; label: string }[] = [
  { value: "pending", label: "To do" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Done" },
  { value: "all", label: "All" },
];

export function TasksScreen() {
  const c = useColors();
  const [status, setStatus] = React.useState<Status>("pending");
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [priority, setPriority] = React.useState<"all" | Task["priority"]>("all");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: cats } = useQuery<TaskCategory[]>("/api/categories/tasks");
  const path = `/api/tasks${qs({ status, category_id: categoryId, priority, q: search })}`;
  const { data, error, loading, refreshing, refresh, mutate } = useQuery<Task[]>(path);

  async function toggle(t: Task) {
    if (data) mutate(data.map((x) => (x.id === t.id ? { ...x, completed: !t.completed } : x)));
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", json: { completed: !t.completed } });
      if (!t.completed) toast("Task completed ✓");
    } catch (e) {
      toast(errorMessage(e));
    }
    invalidate("/api/tasks", "/api/dashboard", "/api/activity");
  }

  async function remove(t: Task) {
    if (!(await confirm("Delete task?", `“${t.title}” will be removed.`))) return;
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
      invalidate("/api/tasks", "/api/dashboard", "/api/activity");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const prColor = { high: c.danger, medium: c.warning, low: c.success };

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Tasks" subtitle={data ? `${data.length} shown` : undefined} refreshing={refreshing} onRefresh={refresh}>
        <Input value={q} onChangeText={setQ} placeholder="Search tasks" right={<Icon name="search" size={18} color={c.mutedForeground} />} />
        <Chips options={STATUS} value={status} onChange={setStatus} />
        <Chips
          options={[{ value: null, label: "All categories" }, ...(cats ?? []).map((x) => ({ value: x.id as number | null, label: x.name, color: x.color }))]}
          value={categoryId}
          onChange={setCategoryId}
        />
        <Segmented
          options={[
            { value: "all", label: "Any priority" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
          value={priority}
          onChange={setPriority}
        />

        {error && !data ? <ErrorBox error={error} onRetry={refresh} /> : null}
        {loading ? <Loading /> : null}
        {data && data.length === 0 ? (
          <Empty icon="check-square" title="No tasks here" text="Add a task or try a different filter." action="New task" onAction={() => { setEditing(null); setOpen(true); }} />
        ) : null}

        {data?.map((t) => {
          const overdue = !t.completed && t.due_date && new Date(t.due_date) < new Date();
          return (
            <Card key={t.id} style={{ padding: 14 }} onPress={() => { setEditing(t); setOpen(true); }}>
              <Row gap={12} style={{ alignItems: "flex-start" }}>
                <View style={{ paddingTop: 2 }}>
                  <Checkbox checked={t.completed} onPress={() => toggle(t)} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <T weight="600" style={t.completed ? { textDecorationLine: "line-through", color: c.mutedForeground } : null}>{t.title}</T>
                  {t.description ? <T variant="small" muted numberOfLines={2}>{t.description}</T> : null}
                  <Row gap={6} style={{ flexWrap: "wrap" }}>
                    <Badge label={t.priority[0].toUpperCase() + t.priority.slice(1)} color={prColor[t.priority]} icon="flag" />
                    {t.category ? <Badge label={t.category.name} color={t.category.color} /> : null}
                    {t.due_date ? <Badge label={friendlyDateTime(t.due_date)} color={overdue ? c.danger : c.mutedForeground} icon="clock" /> : null}
                  </Row>
                </View>
                <Pressable onPress={() => remove(t)} hitSlop={10}>
                  <Icon name="trash-2" size={18} color={c.mutedForeground} />
                </Pressable>
              </Row>
            </Card>
          );
        })}
      </Screen>
      <Fab onPress={() => { setEditing(null); setOpen(true); }} />
      <TaskForm visible={open} onClose={() => setOpen(false)} task={editing} />
    </View>
  );
}
