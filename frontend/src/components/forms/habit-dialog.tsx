"use client";

import * as React from "react";
import { toast } from "sonner";

import { HABIT_ICONS, HabitIcon } from "@/components/habit-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { api, revalidate } from "@/lib/api";
import type { Frequency, Habit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fieldErrors, habitSchema } from "@/lib/validators";

export const HABIT_COLORS = ["#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#0EA5E9", "#64748B"];

export function HabitDialog({
  open,
  onOpenChange,
  habit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  habit?: Habit | null;
}) {
  const [form, setForm] = React.useState({
    name: "",
    description: "",
    frequency: "daily" as Frequency,
    color: HABIT_COLORS[0]!,
    icon: "sparkles",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      name: habit?.name ?? "",
      description: habit?.description ?? "",
      frequency: habit?.frequency ?? "daily",
      color: habit?.color ?? HABIT_COLORS[0]!,
      icon: habit?.icon ?? "sparkles",
    });
  }, [open, habit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = habitSchema.safeParse({ ...form, description: form.description || undefined });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setSaving(true);
    try {
      if (habit) await api(`/api/habits/${habit.id}`, { method: "PATCH", json: parsed.data });
      else await api("/api/habits", { method: "POST", json: parsed.data });
      toast.success(habit ? "Habit updated" : "Habit created — you've got this!");
      revalidate("/api/habits", "/api/dashboard");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save habit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={habit ? "Edit habit" : "New habit"} description="Small steps, repeated, become big changes.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Habit name" error={errors.name} htmlFor="habit-name">
            <Input
              id="habit-name"
              autoFocus
              placeholder="e.g. Read for 30 minutes"
              value={form.name}
              aria-invalid={!!errors.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Why it matters (optional)" htmlFor="habit-desc">
            <Textarea
              id="habit-desc"
              className="min-h-16"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Frequency">
            <Segmented
              value={form.frequency}
              onChange={(v) => setForm({ ...form, frequency: v })}
              options={[
                { value: "daily", label: "Every day" },
                { value: "weekly", label: "Once a week" },
              ]}
            />
          </Field>
          <Field label="Icon">
            <div className="flex flex-wrap gap-2">
              {HABIT_ICONS.map((name) => (
                <button
                  type="button"
                  key={name}
                  aria-label={name}
                  aria-pressed={form.icon === name}
                  onClick={() => setForm({ ...form, icon: name })}
                  className={cn(
                    "grid size-10 place-items-center rounded-xl border transition",
                    form.icon === name ? "border-transparent text-white" : "border-border hover:bg-muted",
                  )}
                  style={form.icon === name ? { background: form.color } : undefined}
                >
                  <HabitIcon name={name} className="size-4" />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {HABIT_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-label={`Color ${c}`}
                  aria-pressed={form.color === c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    "size-8 rounded-full ring-offset-2 ring-offset-card transition",
                    form.color === c && "ring-2",
                  )}
                  style={{ background: c, ["--tw-ring-color" as string]: c }}
                />
              ))}
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {habit ? "Save changes" : "Create habit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
