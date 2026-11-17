"use client";

import { addDays, addWeeks, format, isSameDay, startOfDay, startOfWeek } from "date-fns";
import {
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { TaskDialog } from "@/components/forms/task-dialog";
import { Badge, PRIORITY_BADGE } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/input";
import { Checkbox, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { api, qs, revalidate } from "@/lib/api";
import type { Task, TaskCategory } from "@/lib/types";
import { cn, friendlyDay, toISODate } from "@/lib/utils";

type Status = "all" | "pending" | "today" | "upcoming" | "overdue" | "completed";

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
  compact,
}: {
  task: Task;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const overdue = !task.completed && task.due_date && new Date(task.due_date) < new Date();
  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl transition-colors",
        compact ? "border border-border bg-card p-2.5" : "px-4 py-3.5 hover:bg-muted/50",
      )}
    >
      <Checkbox checked={task.completed} onChange={onToggle} label={`Complete ${task.title}`} className="mt-0.5" />
      <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
        <p className={cn("text-sm font-medium", compact ? "line-clamp-2" : "truncate", task.completed && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        {!compact && task.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {!compact && (
            <Badge variant={PRIORITY_BADGE[task.priority]} className="capitalize">
              {task.priority}
            </Badge>
          )}
          {task.category && (
            <Badge variant="muted">
              <span className="size-1.5 rounded-full" style={{ background: task.category.color }} />
              {task.category.name}
            </Badge>
          )}
          {task.due_date && (
            <span className={cn("inline-flex items-center gap-1 text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>
              <CalendarClock className="size-3.5" />
              {compact ? format(new Date(task.due_date), "h:mm a") : `${friendlyDay(new Date(task.due_date))}, ${format(new Date(task.due_date), "h:mm a")}`}
              {overdue && " · overdue"}
            </span>
          )}
        </div>
      </button>
      {!compact && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 opacity-60 group-hover:opacity-100" aria-label="Task actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [view, setView] = React.useState<"list" | "week">("list");
  const [status, setStatus] = React.useState<Status>("pending");
  const [categoryId, setCategoryId] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [defaultDue, setDefaultDue] = React.useState<string | undefined>();

  React.useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const key =
    view === "list"
      ? `/api/tasks${qs({ status, category_id: categoryId, priority, q })}`
      : `/api/tasks${qs({ due_from: toISODate(weekStart), due_to: toISODate(addDays(weekStart, 6)), category_id: categoryId, priority, q })}`;
  const { data: tasks, isLoading, mutate } = useSWR<Task[]>(key);
  const { data: categories } = useSWR<TaskCategory[]>("/api/categories/tasks");

  async function toggle(task: Task, completed: boolean) {
    mutate(tasks?.map((t) => (t.id === task.id ? { ...t, completed } : t)), false);
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", json: { completed } });
      if (completed) toast.success("Task completed 🎉");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
    revalidate("/api/tasks", "/api/dashboard");
  }

  async function remove(task: Task) {
    if (!confirm(`Delete “${task.title}”?`)) return;
    await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    toast.success("Task deleted");
    revalidate("/api/tasks", "/api/dashboard");
  }

  function openNew(due?: Date) {
    setEditing(null);
    setDefaultDue(due ? format(due, "yyyy-MM-dd'T'09:00") : undefined);
    setDialogOpen(true);
  }

  const groups = React.useMemo(() => {
    if (!tasks) return [];
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const label = t.completed
        ? "Completed"
        : !t.due_date
          ? "No due date"
          : new Date(t.due_date) < startOfDay(new Date())
            ? "Overdue"
            : friendlyDay(new Date(t.due_date));
      map.set(label, [...(map.get(label) ?? []), t]);
    }
    return [...map.entries()];
  }, [tasks]);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Organize your personal and professional to-dos."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List" },
                { value: "week", label: "Week" },
              ]}
            />
            <Button onClick={() => openNew()}>
              <Plus /> New task
            </Button>
          </>
        }
      />

      <Card className="mb-6 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {view === "list" ? (
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: "pending", label: "Pending" },
                { value: "today", label: "Today" },
                { value: "upcoming", label: "Upcoming" },
                { value: "overdue", label: "Overdue" },
                { value: "completed", label: "Done" },
                { value: "all", label: "All" },
              ]}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
                <ChevronLeft />
              </Button>
              <p className="min-w-44 text-center text-sm font-semibold">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </p>
              <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
                <ChevronRight />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
                This week
              </Button>
            </div>
          )}
          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-[1fr_160px_140px] lg:ml-auto lg:max-w-xl">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search tasks" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category">
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
              <option value="">Any priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </div>
        </div>
      </Card>

      {isLoading && !tasks ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : view === "list" ? (
        tasks && tasks.length > 0 ? (
          <div className="space-y-5">
            {groups.map(([label, items]) => (
              <Card key={label} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <h2 className={cn("text-sm font-semibold", label === "Overdue" && "text-danger")}>{label}</h2>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="divide-y divide-border">
                  {items.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      onToggle={(v) => toggle(t, v)}
                      onEdit={() => {
                        setEditing(t);
                        setDialogOpen(true);
                      }}
                      onDelete={() => remove(t)}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              icon={status === "completed" ? CheckSquare : LayoutList}
              title={q ? "No matching tasks" : status === "overdue" ? "Nothing overdue 🎉" : "No tasks here"}
              description={q ? "Try a different search." : "Add a task to start planning your day."}
              action={<Button onClick={() => openNew()}><Plus /> New task</Button>}
            />
          </Card>
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((day) => {
            const items = tasks?.filter((t) => t.due_date && isSameDay(new Date(t.due_date), day)) ?? [];
            const today = isSameDay(day, new Date());
            return (
              <div key={day.toISOString()} className={cn("flex min-h-40 flex-col rounded-2xl border bg-muted/40 p-2.5", today ? "border-primary/50 bg-primary-soft/40" : "border-border")}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <div>
                    <p className={cn("text-xs font-medium uppercase", today ? "text-primary" : "text-muted-foreground")}>{format(day, "EEE")}</p>
                    <p className={cn("text-lg font-bold", today && "text-primary")}>{format(day, "d")}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Add task on ${format(day, "EEEE")}`} onClick={() => openNew(day)}>
                    <Plus />
                  </Button>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <TaskRow
                      key={t.id}
                      compact
                      task={t}
                      onToggle={(v) => toggle(t, v)}
                      onEdit={() => {
                        setEditing(t);
                        setDialogOpen(true);
                      }}
                      onDelete={() => remove(t)}
                    />
                  ))}
                  {items.length === 0 && <p className="px-1 text-xs text-muted-foreground/70">No tasks</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} task={editing} defaultDue={defaultDue} />
    </>
  );
}
