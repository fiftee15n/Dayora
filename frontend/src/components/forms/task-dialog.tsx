"use client";

import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { api, ApiError, revalidate } from "@/lib/api";
import type { Priority, Task, TaskCategory } from "@/lib/types";
import { fromLocalInput, toLocalInput } from "@/lib/utils";
import { fieldErrors, taskSchema } from "@/lib/validators";

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultDue,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: Task | null;
  defaultDue?: string;
}) {
  const { data: categories } = useSWR<TaskCategory[]>(open ? "/api/categories/tasks" : null);
  const [form, setForm] = React.useState({
    title: "",
    description: "",
    priority: "medium" as Priority,
    due: "",
    category_id: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: task?.priority ?? "medium",
      due: task ? toLocalInput(task.due_date) : (defaultDue ?? ""),
      category_id: task?.category_id ? String(task.category_id) : "",
    });
  }, [open, task, defaultDue]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      description: form.description || undefined,
      priority: form.priority,
      due_date: fromLocalInput(form.due),
      category_id: form.category_id ? Number(form.category_id) : null,
    };
    const parsed = taskSchema.safeParse(payload);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setSaving(true);
    try {
      if (task) await api(`/api/tasks/${task.id}`, { method: "PATCH", json: parsed.data });
      else await api("/api/tasks", { method: "POST", json: parsed.data });
      toast.success(task ? "Task updated" : "Task added");
      revalidate("/api/tasks", "/api/dashboard", "/api/activity", "/api/reports");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : "Could not save task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={task ? "Edit task" : "New task"} description="Plan what needs to get done.">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Title" error={errors.title} htmlFor="task-title">
            <Input
              id="task-title"
              autoFocus
              placeholder="e.g. Finish the project report"
              value={form.title}
              aria-invalid={!!errors.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Description" htmlFor="task-desc">
            <Textarea
              id="task-desc"
              placeholder="Add details (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Priority">
            <Segmented
              value={form.priority}
              onChange={(v) => setForm({ ...form, priority: v })}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date" htmlFor="task-due">
              <Input
                id="task-due"
                type="datetime-local"
                value={form.due}
                onChange={(e) => setForm({ ...form, due: e.target.value })}
              />
            </Field>
            <Field label="Category" htmlFor="task-cat" error={errors.category_id}>
              <Select
                id="task-cat"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">No category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {task ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
