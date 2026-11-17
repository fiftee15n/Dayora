"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, revalidate } from "@/lib/api";
import type { Recurrence, Reminder } from "@/lib/types";
import { fromLocalInput, toLocalInput } from "@/lib/utils";
import { fieldErrors, reminderSchema } from "@/lib/validators";

export function ReminderDialog({
  open,
  onOpenChange,
  reminder,
  defaultAt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reminder?: Reminder | null;
  defaultAt?: string;
}) {
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    remind_at: "",
    recurrence: "none" as Recurrence,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      title: reminder?.title ?? "",
      description: reminder?.description ?? "",
      remind_at: reminder ? toLocalInput(reminder.remind_at) : (defaultAt ?? ""),
      recurrence: reminder?.recurrence ?? "none",
    });
  }, [open, reminder, defaultAt]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = reminderSchema.safeParse({ ...form, description: form.description || undefined });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    const json = { ...parsed.data, remind_at: fromLocalInput(parsed.data.remind_at) };
    setSaving(true);
    try {
      if (reminder) await api(`/api/reminders/${reminder.id}`, { method: "PATCH", json });
      else await api("/api/reminders", { method: "POST", json });
      toast.success(reminder ? "Reminder updated" : "Reminder set");
      revalidate("/api/reminders", "/api/dashboard", "/api/activity");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save reminder");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={reminder ? "Edit reminder" : "New reminder"} description="We'll nudge you at the right time.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Title" error={errors.title} htmlFor="rem-title">
            <Input
              id="rem-title"
              autoFocus
              placeholder="e.g. Pay electricity bill"
              value={form.title}
              aria-invalid={!!errors.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date & time" error={errors.remind_at} htmlFor="rem-at">
              <Input
                id="rem-at"
                type="datetime-local"
                value={form.remind_at}
                aria-invalid={!!errors.remind_at}
                onChange={(e) => setForm({ ...form, remind_at: e.target.value })}
              />
            </Field>
            <Field label="Repeat" htmlFor="rem-rec">
              <Select
                id="rem-rec"
                value={form.recurrence}
                onChange={(e) => setForm({ ...form, recurrence: e.target.value as Recurrence })}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="monthly">Every month</option>
                <option value="yearly">Every year</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="rem-desc">
            <Textarea
              id="rem-desc"
              className="min-h-16"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {reminder ? "Save changes" : "Set reminder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
