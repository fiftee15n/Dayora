"use client";

import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Flame,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  Trash2,
  Trophy,
  TrendingUp,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { HabitDialog } from "@/components/forms/habit-dialog";
import { HabitIcon } from "@/components/habit-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, PageHeader, Progress, Segmented, Skeleton, StatCard } from "@/components/ui/misc";
import { api, revalidate } from "@/lib/api";
import type { Habit, HabitOverview } from "@/lib/types";
import { cn, toISODate } from "@/lib/utils";

function Heatmap({ data }: { data: HabitOverview["calendar"] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  // Pad to start on Monday so columns are weeks.
  const first = parseISO(data[0]!.date);
  const pad = (first.getDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...data];
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
        {cells.map((d, i) =>
          d ? (
            <div
              key={d.date}
              title={`${format(parseISO(d.date), "EEE, MMM d")}: ${d.count} check-in${d.count === 1 ? "" : "s"}`}
              className="size-3.5 rounded-[4px]"
              style={{
                background: d.count === 0 ? "var(--muted)" : `color-mix(in srgb, var(--primary) ${25 + (d.count / max) * 75}%, transparent)`,
              }}
            />
          ) : (
            <div key={`pad-${i}`} className="size-3.5" />
          ),
        )}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        Less
        {[0, 0.3, 0.6, 1].map((v) => (
          <span
            key={v}
            className="size-3 rounded-[3px]"
            style={{ background: v === 0 ? "var(--muted)" : `color-mix(in srgb, var(--primary) ${25 + v * 75}%, transparent)` }}
          />
        ))}
        More
      </div>
    </div>
  );
}

function HabitMonth({ habit, onToggle }: { habit: Habit; onToggle: (date: string) => void }) {
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const { data: logs } = useSWR<string[]>(
    `/api/habits/${habit.id}/logs?start=${toISODate(startOfMonth(month))}&end=${toISODate(endOfMonth(month))}`,
  );
  const set = new Set(logs ?? []);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: addDays(startOfWeek(endOfMonth(month), { weekStartsOn: 1 }), 6),
  });
  const today = new Date();
  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="size-7" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft />
        </Button>
        <p className="text-sm font-semibold">{format(month, "MMMM yyyy")}</p>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Next month" disabled={isSameMonth(month, today)} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {days.map((d) => {
          const iso = toISODate(d);
          const done = set.has(iso);
          const future = isAfter(d, today);
          const outside = !isSameMonth(d, month);
          return (
            <button
              key={iso}
              disabled={future || outside}
              onClick={() => onToggle(iso)}
              className={cn(
                "aspect-square rounded-lg text-xs font-medium transition",
                outside && "invisible",
                future ? "text-muted-foreground/40" : "hover:ring-2 hover:ring-primary/30",
                done ? "text-white" : "text-foreground",
              )}
              style={done ? { background: habit.color } : undefined}
              aria-label={`${format(d, "MMMM d")}: ${done ? "done" : "not done"}`}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HabitCard({ habit, onEdit }: { habit: Habit; onEdit: () => void }) {
  const [expanded, setExpanded] = React.useState(false);
  const logs = new Set(habit.recent_logs);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
  const doneNow = habit.frequency === "daily" ? habit.done_today : habit.done_this_week;

  async function toggle(date?: string) {
    try {
      const updated = await api<Habit>(`/api/habits/${habit.id}/toggle`, { method: "POST", json: date ? { date } : {} });
      if (!date && (updated.done_today || updated.done_this_week)) {
        toast.success(updated.current_streak > 1 ? `🔥 ${updated.current_streak}-${habit.frequency === "daily" ? "day" : "week"} streak!` : "Habit checked off!");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    }
    revalidate("/api/habits", "/api/dashboard");
  }

  async function archive() {
    await api(`/api/habits/${habit.id}`, { method: "PATCH", json: { archived: !habit.archived } });
    toast.success(habit.archived ? "Habit restored" : "Habit archived");
    revalidate("/api/habits", "/api/dashboard");
  }

  async function remove() {
    if (!confirm(`Delete “${habit.name}” and all its history?`)) return;
    await api(`/api/habits/${habit.id}`, { method: "DELETE" });
    revalidate("/api/habits", "/api/dashboard");
  }

  return (
    <Card className={cn("p-5", habit.archived && "opacity-70")}>
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: habit.color }}>
          <HabitIcon name={habit.icon} className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{habit.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" className="capitalize">{habit.frequency}</Badge>
            <span className="text-xs text-muted-foreground">
              🔥 {habit.current_streak} {habit.frequency === "daily" ? "day" : "week"} streak · best {habit.best_streak}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Habit actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={archive}>
              {habit.archived ? <ArchiveRestore /> : <Archive />} {habit.archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={remove}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {habit.description && <p className="mt-3 text-sm text-muted-foreground">{habit.description}</p>}

      <div className="mt-4 flex justify-between gap-1">
        {last7.map((d) => {
          const iso = toISODate(d);
          const done = logs.has(iso);
          return (
            <button
              key={iso}
              onClick={() => toggle(iso)}
              className="flex flex-1 flex-col items-center gap-1"
              aria-label={`${format(d, "EEEE")}: ${done ? "done" : "not done"}`}
            >
              <span className="text-[11px] text-muted-foreground">{format(d, "EEEEE")}</span>
              <span
                className={cn("grid size-8 place-items-center rounded-full border-2 text-xs font-semibold transition", done ? "border-transparent text-white" : "border-border hover:border-primary")}
                style={done ? { background: habit.color } : undefined}
              >
                {format(d, "d")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-muted-foreground">{habit.frequency === "daily" ? "Last 30 days" : "Last 12 weeks"}</span>
          <span className="font-semibold">{habit.completion_rate}%</span>
        </div>
        <Progress value={habit.completion_rate} color={habit.color} />
      </div>

      {expanded && <HabitMonth habit={habit} onToggle={toggle} />}

      <div className="mt-4 flex gap-2">
        {!habit.archived && (
          <Button
            className="flex-1"
            variant={doneNow ? "secondary" : "default"}
            style={doneNow ? undefined : { background: habit.color }}
            onClick={() => toggle()}
          >
            {doneNow ? "✓ Done" : habit.frequency === "daily" ? "Mark done today" : "Mark done this week"}
          </Button>
        )}
        <Button variant="outline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Hide" : "Calendar"}
        </Button>
      </div>
    </Card>
  );
}

export default function HabitsPage() {
  const [tab, setTab] = React.useState<"active" | "archived">("active");
  const { data: habits, isLoading } = useSWR<Habit[]>(`/api/habits?include_archived=${tab === "archived"}`);
  const { data: overview } = useSWR<HabitOverview>("/api/habits/overview?days=140");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Habit | null>(null);

  const list = habits?.filter((h) => (tab === "archived" ? h.archived : !h.archived)) ?? [];

  return (
    <>
      <PageHeader
        title="Habits"
        description="Build consistency, one day at a time."
        actions={
          <>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "active", label: "Active" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <Button
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus /> New habit
            </Button>
          </>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's progress" value={overview ? `${overview.done_today}/${overview.due_today}` : "—"} icon={Target} sub={overview && <Progress value={overview.progress} />} />
        <StatCard label="Active habits" value={overview?.total ?? "—"} icon={Flame} tone="accent" />
        <StatCard label="Best streak" value={overview ? `${overview.best_streak} days` : "—"} icon={Trophy} tone="warning" />
        <StatCard label="Avg. completion" value={overview ? `${overview.average_completion}%` : "—"} icon={TrendingUp} tone="success" />
      </section>

      {overview && overview.total > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Consistency calendar</CardTitle>
            <span className="text-xs text-muted-foreground">Last 20 weeks</span>
          </CardHeader>
          <CardContent>
            <Heatmap data={overview.calendar} />
          </CardContent>
        </Card>
      )}

      {isLoading && !habits ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title={tab === "archived" ? "No archived habits" : "Start your first habit"}
            description={tab === "archived" ? "Archived habits will appear here." : "Try reading for 30 minutes, drinking water, or a short walk."}
            action={
              tab === "active" && (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus /> New habit
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              onEdit={() => {
                setEditing(h);
                setDialogOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <HabitDialog open={dialogOpen} onOpenChange={setDialogOpen} habit={editing} />
    </>
  );
}
