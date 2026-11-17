"use client";

import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { api, ApiError, revalidate } from "@/lib/api";
import type { ExpenseCategory, Transaction, TxType } from "@/lib/types";
import { PAYMENT_METHODS, toISODate } from "@/lib/utils";
import { fieldErrors, transactionSchema } from "@/lib/validators";

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  defaultType = "expense",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction?: Transaction | null;
  defaultType?: TxType;
}) {
  const { data: categories } = useSWR<ExpenseCategory[]>(open ? "/api/categories/expenses" : null);
  const [form, setForm] = React.useState({
    type: defaultType as TxType,
    amount: "",
    description: "",
    payment_method: "cash",
    date: toISODate(),
    category_id: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm({
      type: transaction?.type ?? defaultType,
      amount: transaction ? String(transaction.amount) : "",
      description: transaction?.description ?? "",
      payment_method: transaction?.payment_method ?? "cash",
      date: transaction?.date ?? toISODate(),
      category_id: transaction?.category_id ? String(transaction.category_id) : "",
    });
  }, [open, transaction, defaultType]);

  const visibleCats = categories?.filter((c) => c.kind === form.type) ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = transactionSchema.safeParse({
      ...form,
      amount: form.amount === "" ? NaN : Number(form.amount),
      description: form.description || undefined,
      category_id: form.category_id ? Number(form.category_id) : null,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setSaving(true);
    try {
      if (transaction) await api(`/api/transactions/${transaction.id}`, { method: "PATCH", json: parsed.data });
      else await api("/api/transactions", { method: "POST", json: parsed.data });
      toast.success(transaction ? "Transaction updated" : `${form.type === "income" ? "Income" : "Expense"} recorded`);
      revalidate("/api/transactions", "/api/budgets", "/api/dashboard", "/api/activity", "/api/reports");
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={transaction ? "Edit transaction" : "New transaction"}
        description="Keep track of where your money goes."
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Segmented
            className="w-full [&>button]:flex-1"
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v, category_id: "" })}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" error={errors.amount} htmlFor="tx-amount">
              <Input
                id="tx-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                autoFocus
                placeholder="0.00"
                value={form.amount}
                aria-invalid={!!errors.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Date" error={errors.date} htmlFor="tx-date">
              <Input
                id="tx-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="tx-desc">
            <Input
              id="tx-desc"
              placeholder={form.type === "expense" ? "e.g. Groceries at the market" : "e.g. Monthly salary"}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="tx-cat">
              <Select
                id="tx-cat"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">Uncategorized</option>
                {visibleCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment method" htmlFor="tx-pay">
              <Select
                id="tx-pay"
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
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
              {transaction ? "Save changes" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
