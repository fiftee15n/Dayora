import { format } from "date-fns/format";
import * as React from "react";
import { Pressable, View } from "react-native";

import { api, ApiError } from "./api";
import { useUser } from "./auth";
import { syncReminderNotifications } from "./notifications";
import { invalidate, useQuery } from "./query";
import { useColors } from "./theme";
import type { Budget, ExpenseCategory, Habit, Reminder, Task, TaskCategory, Transaction, TxType } from "./types";
import { Button, Chips, DateField, Field, Icon, type IconName, Input, Row, Segmented, Sheet, T, errorMessage, toast } from "./ui";
import { PAYMENT_METHODS, PRIORITIES, RECURRENCES, SWATCHES, formatMoney, parseDateOnly, toISODate, monthKey, monthLabel } from "./utils";

type Errors = Record<string, string>;

export function useSubmit() {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Errors>({});
  async function run(fn: () => Promise<void>) {
    setSaving(true);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast(errorMessage(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  }
  return { saving, errors, setErrors, run };
}

// ---------------- Task ----------------
export function TaskForm({ visible, onClose, task, defaultDue }: { visible: boolean; onClose: () => void; task?: Task | null; defaultDue?: Date }) {
  const { data: cats } = useQuery<TaskCategory[]>(visible ? "/api/categories/tasks" : null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<Task["priority"]>("medium");
  const [due, setDue] = React.useState<Date | null>(null);
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPriority(task?.priority ?? "medium");
    setDue(task?.due_date ? new Date(task.due_date) : defaultDue ?? null);
    setCategoryId(task?.category_id ?? null);
    setErrors({});
  }, [visible, task, defaultDue, setErrors]);

  const save = () =>
    run(async () => {
      if (!title.trim()) return setErrors({ title: "Give the task a title" });
      const json = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: due ? due.toISOString() : null,
        category_id: categoryId,
      };
      if (task) await api(`/api/tasks/${task.id}`, { method: "PATCH", json });
      else await api("/api/tasks", { method: "POST", json });
      invalidate("/api/tasks", "/api/dashboard", "/api/activity");
      toast(task ? "Task updated" : "Task added");
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={task ? "Edit task" : "New task"} footer={<Button title={task ? "Save changes" : "Add task"} onPress={save} loading={saving} />}>
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="What needs doing?" error={errors.title} autoFocus={!task} />
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="Optional details" multiline />
      <Field label="Priority">
        <Segmented options={PRIORITIES.map((p) => ({ ...p }))} value={priority} onChange={setPriority} />
      </Field>
      <DateField label="Due" value={due} onChange={setDue} withTime clearable />
      <Field label="Category">
        <Chips
          options={[{ value: null, label: "None" }, ...(cats ?? []).map((c) => ({ value: c.id as number | null, label: c.name, color: c.color }))]}
          value={categoryId}
          onChange={setCategoryId}
        />
        <NewCategory
          existing={(cats ?? []).map((x) => x.name)}
          suggestions={TASK_CATEGORY_SUGGESTIONS}
          onCreate={async (name, color) => {
            const cat = await api<TaskCategory>("/api/categories/tasks", { method: "POST", json: { name, color } });
            invalidate("/api/categories/tasks");
            return cat;
          }}
          onCreated={(cat) => setCategoryId(cat.id)}
        />
      </Field>
    </Sheet>
  );
}

const TASK_CATEGORY_SUGGESTIONS = ["Fitness", "Shopping", "Finance", "Family", "Errands", "Home", "Learning"];
const EXPENSE_CATEGORY_SUGGESTIONS = ["Restaurant", "Marathon", "Fitness", "Travel", "Rent", "Subscriptions", "Gifts", "Charity"];
const INCOME_CATEGORY_SUGGESTIONS = ["Business", "Bonus", "Rental income", "Interest", "Refund"];
const CATEGORY_COLORS = ["#F97316", "#0EA5E9", "#10B981", "#EC4899", "#8B5CF6", "#EAB308", "#64748B"];

/** "+ New category" inside a form: one-tap suggestions (Fitness, Marathon, …) or a custom name. */
function NewCategory<C extends { id: number; name: string }>({
  existing,
  suggestions: all,
  onCreate,
  onCreated,
}: {
  existing: string[];
  suggestions: string[];
  onCreate: (name: string, color: string) => Promise<C>;
  onCreated: (c: C) => void;
}) {
  const c = useColors();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const suggestions = all.filter((s) => !taken.has(s.toLowerCase()));

  async function create(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (taken.has(value.toLowerCase())) return toast(`"${value}" already exists`);
    setBusy(true);
    try {
      const cat = await onCreate(value, CATEGORY_COLORS[existing.length % CATEGORY_COLORS.length]);
      onCreated(cat);
      setName("");
      setOpen(false);
      toast(`Category "${cat.name}" added`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 }}>
        <Icon name="plus" size={15} color={c.foreground} />
        <T variant="label">New category</T>
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.muted }}>
      {suggestions.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => create(s)}
              disabled={busy}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 12,
                height: 32,
                borderRadius: 16,
                backgroundColor: pressed ? c.border : c.card,
                borderWidth: 1,
                borderColor: c.border,
              })}
            >
              <Icon name="plus" size={13} color={c.foreground} />
              <T variant="small" weight="600">{s}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Row gap={8}>
        <View style={{ flex: 1 }}>
          <Input value={name} onChangeText={setName} placeholder="Or type a name" autoFocus={!suggestions.length} onSubmitEditing={() => create(name)} />
        </View>
        <Button title="Add" small onPress={() => create(name)} loading={busy} disabled={!name.trim()} />
      </Row>
      <Pressable onPress={() => setOpen(false)} hitSlop={6} style={{ alignSelf: "flex-start" }}>
        <T variant="caption" muted>Cancel</T>
      </Pressable>
    </View>
  );
}

// ---------------- Transaction ----------------
/** Which month an income is for. Default: the month it was received (`value` null). */
export function ForMonthField({ date, value, onChange }: { date: Date; value: string | null; onChange: (v: string | null) => void }) {
  const received = monthKey(date);
  const options: { value: string | null; label: string }[] = [{ value: null, label: `${monthLabel(received, date)} (received)` }];
  for (let i = 1; i <= 12; i++) {
    const k = monthKey(new Date(date.getFullYear(), date.getMonth() - i, 1));
    options.push({ value: k, label: monthLabel(k, date) });
  }
  const next = monthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1));
  options.push({ value: next, label: `${monthLabel(next, date)} (advance)` });
  // A month further back that isn't in the list (editing an old entry) stays selectable.
  if (value && !options.some((o) => o.value === value)) options.splice(1, 0, { value, label: monthLabel(value, date) });
  return (
    <Field label="For month">
      <Chips options={options} value={value === received ? null : value} onChange={onChange} />
      <T variant="caption" muted>
        {value && value !== received
          ? `Counts in ${monthLabel(received, date)}'s income (when you received it). ${monthLabel(value, date)} shows it as received later.`
          : "E.g. October's salary paid in November: pick October."}
      </T>
    </Field>
  );
}

export function TransactionForm({ visible, onClose, transaction, defaultType = "expense" }: { visible: boolean; onClose: () => void; transaction?: Transaction | null; defaultType?: TxType }) {
  const user = useUser();
  const c = useColors();
  const { data: cats } = useQuery<ExpenseCategory[]>(visible ? "/api/categories/expenses" : null);
  const [type, setType] = React.useState<TxType>(defaultType);
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [date, setDate] = React.useState<Date>(new Date());
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [forMonth, setForMonth] = React.useState<string | null>(null);
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setForMonth(transaction?.for_month ?? null);
    setType(transaction?.type ?? defaultType);
    setAmount(transaction ? String(transaction.amount) : "");
    setDescription(transaction?.description ?? "");
    setMethod(transaction?.payment_method ?? "cash");
    setDate(transaction ? parseDateOnly(transaction.date) : new Date());
    setCategoryId(transaction?.category_id ?? null);
    setErrors({});
  }, [visible, transaction, defaultType, setErrors]);

  const save = () =>
    run(async () => {
      const value = Number(amount.replace(/,/g, ""));
      if (!value || value <= 0) return setErrors({ amount: "Enter an amount greater than 0" });
      const json = {
        type,
        amount: value,
        description: description.trim() || null,
        payment_method: method,
        date: toISODate(date),
        category_id: categoryId,
        for_month: type === "income" && forMonth !== monthKey(date) ? forMonth : null,
      };
      if (transaction) await api(`/api/transactions/${transaction.id}`, { method: "PATCH", json });
      else await api("/api/transactions", { method: "POST", json });
      invalidate("/api/transactions", "/api/budgets", "/api/dashboard", "/api/activity", "/api/reports", "/api/income-sources", "/api/loans", "/api/savings");
      toast(transaction ? "Transaction updated" : type === "income" ? "Income recorded" : "Expense recorded");
      onClose();
    });

  const kindCats = (cats ?? []).filter((x) => x.kind === type);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={transaction ? "Edit transaction" : "New transaction"}
      footer={<Button title={transaction ? "Save changes" : "Save"} onPress={save} loading={saving} />}
    >
      <Segmented
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
        value={type}
        onChange={(t) => {
          setType(t);
          setCategoryId(null);
        }}
      />
      <Input
        label={`Amount (${user.currency})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={errors.amount}
        style={{ fontSize: 22, fontWeight: "700", color: type === "income" ? c.success : c.foreground }}
      />
      <Input label="Description" value={description} onChangeText={setDescription} placeholder={type === "income" ? "e.g. Salary" : "e.g. Groceries"} />
      <Field label="Category">
        <Chips
          options={[{ value: null, label: "None" }, ...kindCats.map((x) => ({ value: x.id as number | null, label: x.name, color: x.color }))]}
          value={categoryId}
          onChange={setCategoryId}
        />
        <NewCategory
          key={type}
          existing={kindCats.map((x) => x.name)}
          suggestions={type === "expense" ? EXPENSE_CATEGORY_SUGGESTIONS : INCOME_CATEGORY_SUGGESTIONS}
          onCreate={async (name, color) => {
            const cat = await api<ExpenseCategory>("/api/categories/expenses", { method: "POST", json: { name, color, kind: type } });
            invalidate("/api/categories/expenses");
            return cat;
          }}
          onCreated={(cat) => setCategoryId(cat.id)}
        />
      </Field>
      <DateField label={type === "income" ? "Date received" : "Date"} value={date} onChange={(d) => d && setDate(d)} />
      {type === "income" ? <ForMonthField date={date} value={forMonth} onChange={setForMonth} /> : null}
      <Field label="Payment method">
        <Chips options={PAYMENT_METHODS} value={method} onChange={setMethod} />
      </Field>
    </Sheet>
  );
}

// ---------------- Budget ----------------
export function BudgetForm({ visible, onClose, month, budget }: { visible: boolean; onClose: () => void; month: string; budget?: Budget | null }) {
  const user = useUser();
  const { data: cats } = useQuery<ExpenseCategory[]>(visible ? "/api/categories/expenses?kind=expense" : null);
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setAmount(budget ? String(budget.amount) : "");
    setCategoryId(budget?.category_id ?? null);
    setErrors({});
  }, [visible, budget, setErrors]);

  const save = () =>
    run(async () => {
      const value = Number(amount.replace(/,/g, ""));
      if (!value || value <= 0) return setErrors({ amount: "Enter an amount greater than 0" });
      await api("/api/budgets", { method: "PUT", json: { month, amount: value, category_id: categoryId } });
      invalidate("/api/budgets", "/api/dashboard");
      toast("Budget saved");
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={budget ? "Edit budget" : "Set a budget"} footer={<Button title="Save budget" onPress={save} loading={saving} />}>
      <T muted variant="small">
        Budget for {format(parseDateOnly(`${month}-01`), "MMMM yyyy")}. Saving again for the same category replaces it.
      </T>
      <Field label="Applies to">
        <Chips
          options={[{ value: null, label: "Overall" }, ...(cats ?? []).map((x) => ({ value: x.id as number | null, label: x.name, color: x.color }))]}
          value={categoryId}
          onChange={setCategoryId}
        />
      </Field>
      <Input label={`Monthly limit (${user.currency})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={formatMoney(20000, user.currency)} error={errors.amount} />
    </Sheet>
  );
}

// ---------------- Habit ----------------
export const HABIT_ICONS: { key: string; icon: IconName }[] = [
  { key: "sparkles", icon: "star" },
  { key: "book-open", icon: "book-open" },
  { key: "dumbbell", icon: "activity" },
  { key: "droplet", icon: "droplet" },
  { key: "code", icon: "code" },
  { key: "moon", icon: "moon" },
  { key: "sun", icon: "sun" },
  { key: "heart", icon: "heart" },
  { key: "leaf", icon: "feather" },
  { key: "footprints", icon: "navigation" },
  { key: "music", icon: "music" },
  { key: "pen-line", icon: "edit-3" },
];

export function habitIcon(name: string): IconName {
  return HABIT_ICONS.find((h) => h.key === name)?.icon ?? "star";
}

export function HabitForm({ visible, onClose, habit }: { visible: boolean; onClose: () => void; habit?: Habit | null }) {
  const c = useColors();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [frequency, setFrequency] = React.useState<Habit["frequency"]>("daily");
  const [color, setColor] = React.useState(SWATCHES[0]);
  const [icon, setIcon] = React.useState("sparkles");
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setName(habit?.name ?? "");
    setDescription(habit?.description ?? "");
    setFrequency(habit?.frequency ?? "daily");
    setColor(habit?.color ?? SWATCHES[0]);
    setIcon(habit?.icon ?? "sparkles");
    setErrors({});
  }, [visible, habit, setErrors]);

  const save = () =>
    run(async () => {
      if (!name.trim()) return setErrors({ name: "Name your habit" });
      const json = { name: name.trim(), description: description.trim() || null, frequency, color, icon };
      if (habit) await api(`/api/habits/${habit.id}`, { method: "PATCH", json });
      else await api("/api/habits", { method: "POST", json });
      invalidate("/api/habits", "/api/dashboard", "/api/activity");
      toast(habit ? "Habit updated" : "Habit created");
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={habit ? "Edit habit" : "New habit"} footer={<Button title={habit ? "Save changes" : "Create habit"} onPress={save} loading={saving} />}>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Read for 30 minutes" error={errors.name} />
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="Why it matters (optional)" />
      <Field label="Frequency">
        <Segmented
          options={[
            { value: "daily", label: "Every day" },
            { value: "weekly", label: "Once a week" },
          ]}
          value={frequency}
          onChange={setFrequency}
        />
      </Field>
      <Field label="Colour">
        <Row gap={10} style={{ flexWrap: "wrap" }}>
          {SWATCHES.map((s) => (
            <Pressable
              key={s}
              onPress={() => setColor(s)}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: s, borderWidth: 3, borderColor: color === s ? c.foreground : "transparent" }}
            />
          ))}
        </Row>
      </Field>
      <Field label="Icon">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {HABIT_ICONS.map((h) => (
            <Pressable
              key={h.key}
              onPress={() => setIcon(h.key)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: icon === h.key ? color : c.muted,
              }}
            >
              <Icon name={h.icon} size={20} color={icon === h.key ? "#fff" : c.foreground} />
            </Pressable>
          ))}
        </View>
      </Field>
    </Sheet>
  );
}

// ---------------- Reminder ----------------
export function ReminderForm({ visible, onClose, reminder, defaultAt }: { visible: boolean; onClose: () => void; reminder?: Reminder | null; defaultAt?: Date }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [at, setAt] = React.useState<Date>(new Date());
  const [recurrence, setRecurrence] = React.useState<Reminder["recurrence"]>("none");
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setTitle(reminder?.title ?? "");
    setDescription(reminder?.description ?? "");
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    setAt(reminder ? new Date(reminder.series_remind_at ?? reminder.remind_at) : defaultAt ?? next);
    setRecurrence(reminder?.recurrence ?? "none");
    setErrors({});
  }, [visible, reminder, defaultAt, setErrors]);

  const save = () =>
    run(async () => {
      if (!title.trim()) return setErrors({ title: "Give the reminder a title" });
      const json = { title: title.trim(), description: description.trim() || null, remind_at: at.toISOString(), recurrence };
      if (reminder) await api(`/api/reminders/${reminder.id}`, { method: "PATCH", json });
      else await api("/api/reminders", { method: "POST", json });
      invalidate("/api/reminders", "/api/dashboard", "/api/activity");
      syncReminderNotifications();
      toast(reminder ? "Reminder updated" : "Reminder set");
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={reminder ? "Edit reminder" : "New reminder"} footer={<Button title={reminder ? "Save changes" : "Set reminder"} onPress={save} loading={saving} />}>
      <Input label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Pay electricity bill" error={errors.title} />
      <Input label="Description" value={description} onChangeText={setDescription} placeholder="Optional details" />
      <DateField label="When" value={at} onChange={(d) => d && setAt(d)} withTime />
      <Field label="Repeat">
        <Chips options={RECURRENCES.map((r) => ({ ...r }))} value={recurrence} onChange={setRecurrence} />
      </Field>
    </Sheet>
  );
}
