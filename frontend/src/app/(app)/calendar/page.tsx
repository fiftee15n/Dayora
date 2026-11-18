"use client";

import {

  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Bell,
  BellRing,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { ReminderDialog } from "@/components/forms/reminder-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Segmented } from "@/components/ui/misc";
import { api, qs, revalidate } from "@/lib/api";
import type { Reminder, Task } from "@/lib/types";
import { cn, friendlyDateTime, toISODate } from "@/lib/utils";

const REC_LABEL: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

function ReminderItem({ r, onEdit }: { r: Reminder; onEdit: () => void }) {
  const overdue = !r.completed && new Date(r.remind_at) < new Date();
  async function complete() {
    const res = await api<Reminder>(`/api/reminders/${r.id}/complete`, { method: "POST" });
    toast.success(res.completed ? "Reminder completed" : `Done! Next: ${friendlyDateTime(res.remind_at)}`);
    revalidate("/api/reminders", "/api/dashboard", "/api/activity");
  }
  async function reopen() {
    await api(`/api/reminders/${r.id}`, { method: "PATCH", json: { completed: false } });
    revalidate("/api/reminders", "/api/dashboard");
  }
  async function remove() {
    if (!confirm(`Delete “${r.title}”?`)) return;
    await api(`/api/reminders/${r.id}`, { method: "DELETE" });
    revalidate("/api/reminders", "/api/dashboard");
  }
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-border p-3">
      <div className={cn("grid size-9 shrink-0 place-items-center rounded-lg", r.completed ? "bg-success-soft text-success" : overdue ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent")}>
        {r.completed ? <Check className="size-4" /> : overdue ? <BellRing className="size-4" /> : <Bell className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", r.completed && "text-muted-foreground line-through")}>{r.title}</p>
        <p className={cn("text-xs", overdue ? "font-medium text-danger" : "text-muted-foreground")}>{friendlyDateTime(r.remind_at)}</p>
        {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
        {r.recurrence !== "none" && (
          <Badge variant="accent" className="mt-1.5">
            <Repeat className="size-3" /> {REC_LABEL[r.recurrence]}
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 gap-0.5">
        {r.completed ? (
          <Button variant="ghost" size="icon" className="size-8" onClick={reopen} aria-label="Mark as not done">
            <RotateCcw />
          </Button>
        ) : r.occurrence ? null : (
          <Button variant="ghost" size="icon" className="size-8 text-success" onClick={complete} aria-label="Mark as done">
            <Check />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label="Edit reminder">
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon" className="size-8 hover:text-danger" onClick={remove} aria-label="Delete reminder">
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

export default function CalendarPage() {
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = React.useState(() => new Date());
  const [listTab, setListTab] = React.useState<"upcoming" | "overdue" | "completed">("upcoming");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Reminder | null>(null);
  const [defaultAt, setDefaultAt] = React.useState<string>();

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const range = { start: toISODate(gridStart), end: toISODate(gridEnd) };

  const { data: reminders } = useSWR<Reminder[]>(`/api/reminders${qs({ ...range, expand: true })}`);
  const { data: tasks } = useSWR<Task[]>(`/api/tasks${qs({ due_from: range.start, due_to: range.end })}`);
  const { data: list } = useSWR<Reminder[]>(`/api/reminders?status=${listTab}&limit=30`);

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const remindersOn = (d: Date) => reminders?.filter((r) => isSameDay(new Date(r.remind_at), d)) ?? [];
  const tasksOn = (d: Date) => tasks?.filter((t) => t.due_date && isSameDay(new Date(t.due_date), d)) ?? [];

  function openNew(d?: Date) {
    setEditing(null);
    // Today → the next full hour; any other day → 9:00 AM.
    const day = d ?? new Date();
    const at = isToday(day) ? new Date(new Date().setMinutes(0, 0, 0) + 3600_000) : new Date(new Date(day).setHours(9, 0, 0, 0));
    setDefaultAt(format(at, "yyyy-MM-dd'T'HH:mm"));
    setDialogOpen(true);
  }
  function edit(r: Reminder) {
    // A projected occurrence edits the whole series, starting from its stored time.
    setEditing(r.occurrence && r.series_remind_at ? { ...r, remind_at: r.series_remind_at, occurrence: false } : r);
    setDialogOpen(true);
  }

  const dayReminders = remindersOn(selected);
  const dayTasks = tasksOn(selected);

  return (
    <>
      <PageHeader
        title="Calendar & Reminders"
        description="See what's coming and never miss what matters."
        actions={
          <Button onClick={() => openNew(selected)}>
            <Plus /> New reminder
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{format(month, "MMMM yyyy")}</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonth(startOfMonth(new Date()));
                  setSelected(new Date());
                }}
              >
                Today
              </Button>
              <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="pb-1 text-center text-xs font-semibold uppercase text-muted-foreground">
                {d.slice(0, 1)}
                <span className="hidden sm:inline">{d.slice(1)}</span>
              </div>
            ))}
            {days.map((d) => {
              const rs = remindersOn(d);
              const ts = tasksOn(d);
              const isSel = isSameDay(d, selected);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelected(d)}
                  onDoubleClick={() => openNew(d)}
                  className={cn(
                    "flex min-h-16 flex-col rounded-xl border p-1.5 text-left transition sm:min-h-24 sm:p-2",
                    isSel ? "border-primary bg-primary-soft/60" : "border-transparent hover:bg-muted",
                    !isSameMonth(d, month) && "opacity-40",
                  )}
                >
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold sm:text-sm", isToday(d) && "brand-gradient text-white")}>
                    {format(d, "d")}
                  </span>
                  <div className="mt-1 hidden space-y-1 sm:block">
                    {rs.slice(0, 2).map((r) => (
                      <p key={`r${r.id}`} className={cn("truncate rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent", r.completed && "line-through opacity-60")}>
                        {r.title}
                      </p>
                    ))}
                    {ts.slice(0, Math.max(0, 2 - rs.length)).map((t) => (
                      <p key={`t${t.id}`} className={cn("truncate rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-medium text-primary", t.completed && "line-through opacity-60")}>
                        {t.title}
                      </p>
                    ))}
                    {rs.length + ts.length > 2 && <p className="px-1 text-[11px] text-muted-foreground">+{rs.length + ts.length - 2} more</p>}
                  </div>
                  <div className="mt-auto flex gap-0.5 sm:hidden">
                    {rs.length > 0 && <span className="size-1.5 rounded-full bg-accent" />}
                    {ts.length > 0 && <span className="size-1.5 rounded-full bg-primary" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-accent" /> Reminders</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-primary" /> Tasks due</span>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{format(selected, "EEEE, MMMM d")}</CardTitle>
              <Button size="sm" variant="secondary" onClick={() => openNew(selected)}>
                <Plus /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {dayReminders.length === 0 && dayTasks.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled for this day.</p>
              ) : (
                <ul className="space-y-2">
                  {dayReminders.map((r) => (
                    <ReminderItem key={r.id} r={r} onEdit={() => edit(r)} />
                  ))}
                  {dayTasks.map((t) => (
                    <li key={`t${t.id}`} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary">
                        <CheckSquare className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-semibold", t.completed && "text-muted-foreground line-through")}>{t.title}</p>
                        <p className="text-xs text-muted-foreground">Task · {format(new Date(t.due_date!), "h:mm a")}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col items-start gap-1">
              <CardTitle>All reminders</CardTitle>
              <Segmented
                value={listTab}
                onChange={setListTab}
                options={[
                  { value: "upcoming", label: "Upcoming" },
                  { value: "overdue", label: "Overdue" },
                  { value: "completed", label: "History" },
                ]}
              />
            </CardHeader>
            <CardContent>
              {list && list.length > 0 ? (
                <ul className="max-h-[480px] space-y-2 overflow-y-auto scrollbar-thin">
                  {list.map((r) => (
                    <ReminderItem key={r.id} r={r} onEdit={() => edit(r)} />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Bell} title={listTab === "overdue" ? "Nothing overdue" : "No reminders"} className="py-6" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ReminderDialog open={dialogOpen} onOpenChange={setDialogOpen} reminder={editing} defaultAt={defaultAt} />
    </>
  );
}
