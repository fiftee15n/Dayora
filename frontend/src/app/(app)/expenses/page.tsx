"use client";

import { addMonths, endOfMonth, format, parseISO, startOfMonth } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  MoreHorizontal,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Scale,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { CategoryDonut, SpendingAreaChart } from "@/components/charts";
import { TransactionDialog } from "@/components/forms/transaction-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, Progress, Segmented, Skeleton, StatCard } from "@/components/ui/misc";
import { useUser } from "@/hooks/use-user";
import { api, qs, revalidate } from "@/lib/api";
import type { Budget, ExpenseCategory, FinanceSummary, Page, Transaction, TxType } from "@/lib/types";
import { cn, formatMoney, PAYMENT_METHODS, toISODate } from "@/lib/utils";

function BudgetDialog({
  open,
  onOpenChange,
  month,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  month: string;
  categories: ExpenseCategory[];
}) {
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAmount("");
      setCategoryId("");
      setError("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return setError("Enter an amount greater than 0");
    setSaving(true);
    try {
      await api("/api/budgets", {
        method: "PUT",
        json: { month, amount: value, category_id: categoryId ? Number(categoryId) : null },
      });
      toast.success("Budget saved");
      revalidate("/api/budgets", "/api/dashboard");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Set a budget" description={`Spending limit for ${format(parseISO(`${month}-01`), "MMMM yyyy")}.`}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Applies to" htmlFor="b-cat">
            <Select id="b-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Overall monthly budget</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount" error={error} htmlFor="b-amt">
            <Input id="b-amt" type="number" min="0" step="0.01" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save budget
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ExpensesPage() {
  const { currency } = useUser();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [type, setType] = React.useState<"all" | TxType>("all");
  const [categoryId, setCategoryId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [txOpen, setTxOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Transaction | null>(null);
  const [budgetOpen, setBudgetOpen] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  React.useEffect(() => setPage(1), [type, categoryId, q, month]);

  const start = toISODate(month);
  const end = toISODate(endOfMonth(month));
  const monthKey = format(month, "yyyy-MM");

  const { data: summary } = useSWR<FinanceSummary>(`/api/transactions/summary${qs({ start, end })}`);
  const { data: budgets } = useSWR<Budget[]>(`/api/budgets?month=${monthKey}`);
  const { data: categories } = useSWR<ExpenseCategory[]>("/api/categories/expenses");
  const { data: txPage, isLoading } = useSWR<Page<Transaction>>(
    `/api/transactions${qs({ start, end, type, category_id: categoryId, q, page, page_size: 15 })}`,
  );

  const expenseCats = categories?.filter((c) => c.kind === "expense") ?? [];
  const overall = budgets?.find((b) => b.category_id === null);
  const isCurrentMonth = monthKey === format(new Date(), "yyyy-MM");

  async function remove(tx: Transaction) {
    if (!confirm("Delete this transaction?")) return;
    await api(`/api/transactions/${tx.id}`, { method: "DELETE" });
    toast.success("Transaction deleted");
    revalidate("/api/transactions", "/api/budgets", "/api/dashboard");
  }

  async function removeBudget(b: Budget) {
    await api(`/api/budgets/${b.id}`, { method: "DELETE" });
    revalidate("/api/budgets", "/api/dashboard");
  }

  const totalPages = txPage ? Math.max(1, Math.ceil(txPage.total / txPage.page_size)) : 1;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Understand your money: income, spending and budgets."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
              <Button variant="ghost" size="icon" className="size-8" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                <ChevronLeft />
              </Button>
              <span className="min-w-28 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
              <Button variant="ghost" size="icon" className="size-8" aria-label="Next month" disabled={isCurrentMonth} onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight />
              </Button>
            </div>
            <Button
              onClick={() => {
                setEditing(null);
                setTxOpen(true);
              }}
            >
              <Plus /> Add transaction
            </Button>
          </>
        }
      />

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Income" value={summary ? formatMoney(summary.income, currency) : "—"} icon={TrendingUp} tone="success" />
        <StatCard label="Expenses" value={summary ? formatMoney(summary.expense, currency) : "—"} icon={TrendingDown} tone="accent" sub={summary && `${summary.count} transactions`} />
        <StatCard
          label="Balance"
          value={summary ? <span className={summary.balance < 0 ? "text-danger" : ""}>{formatMoney(summary.balance, currency)}</span> : "—"}
          icon={Scale}
          tone={summary && summary.balance < 0 ? "danger" : "primary"}
          sub={summary && summary.income > 0 && `${Math.round((summary.balance / summary.income) * 100)}% savings rate`}
        />
        <StatCard
          label="Top category"
          value={summary?.top_category?.name ?? "—"}
          icon={Crown}
          tone="warning"
          sub={summary?.top_category && `${formatMoney(summary.top_category.total, currency)} · ${summary.top_category.percent}% of spending`}
        />
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Income vs expenses</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Daily totals for {format(month, "MMMM")}</p>
            </div>
          </CardHeader>
          <CardContent>{summary ? <SpendingAreaChart data={summary.daily} currency={currency} showIncome height={260} /> : <Skeleton className="h-64" />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {summary && summary.by_category.length > 0 ? (
              <>
                <div className="relative">
                  <CategoryDonut data={summary.by_category} currency={currency} height={190} />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-lg font-bold">{formatMoney(summary.expense, currency, true)}</p>
                    </div>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {summary.by_category.slice(0, 6).map((c) => (
                    <li key={c.name} className="flex items-center gap-2 text-sm">
                      <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-muted-foreground">{c.percent}%</span>
                      <span className="w-20 text-right font-medium">{formatMoney(c.total, currency, true)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState icon={PiggyBank} title="No spending yet" description="Expenses for this month will show up here." className="py-8" />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <CardTitle>Transactions</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Segmented
                value={type}
                onChange={setType}
                options={[
                  { value: "all", label: "All" },
                  { value: "expense", label: "Expenses" },
                  { value: "income", label: "Income" },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search descriptions" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category">
                <option value="">All categories</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.kind})
                  </option>
                ))}
              </Select>
            </div>
            {isLoading && !txPage ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : txPage && txPage.items.length > 0 ? (
              <>
                <ul className="divide-y divide-border">
                  {txPage.items.map((tx) => (
                    <li key={tx.id} className="group flex items-center gap-3 py-3">
                      <div
                        className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
                        style={{ background: tx.category?.color ?? (tx.type === "income" ? "#10B981" : "#94A3B8") }}
                      >
                        {tx.type === "income" ? <TrendingUp className="size-4" /> : <Receipt className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tx.description || tx.category?.name || (tx.type === "income" ? "Income" : "Expense")}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {format(parseISO(tx.date), "MMM d")} · {tx.category?.name ?? "Uncategorized"} ·
                          <CreditCard className="size-3" />
                          {PAYMENT_METHODS.find((p) => p.value === tx.payment_method)?.label ?? tx.payment_method}
                        </p>
                      </div>
                      <p className={cn("text-sm font-semibold", tx.type === "income" ? "text-success" : "text-foreground")}>
                        {tx.type === "income" ? "+" : "−"}
                        {formatMoney(tx.amount, currency)}
                      </p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 opacity-60 group-hover:opacity-100" aria-label="Transaction actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(tx);
                              setTxOpen(true);
                            }}
                          >
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem destructive onSelect={() => remove(tx)}>
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Page {page} of {totalPages} · {txPage.total} total
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={Receipt} title="No transactions" description="Record your first income or expense for this month." />
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Budgets</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setBudgetOpen(true)}>
              <Plus /> Set budget
            </Button>
          </CardHeader>
          <CardContent>
            {budgets && budgets.length > 0 ? (
              <ul className="space-y-5">
                {[...(overall ? [overall] : []), ...budgets.filter((b) => b.category_id !== null)].map((b) => {
                  const pct = (b.spent / b.amount) * 100;
                  const left = b.amount - b.spent;
                  return (
                    <li key={b.id} className="group">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-semibold">
                          {b.category && <span className="size-2.5 rounded-full" style={{ background: b.category.color }} />}
                          {b.category?.name ?? "Overall budget"}
                        </p>
                        <button onClick={() => removeBudget(b)} className="text-muted-foreground opacity-0 transition hover:text-danger group-hover:opacity-100" aria-label="Remove budget">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <Progress value={pct} color={pct > 100 ? "var(--danger)" : pct > 80 ? "var(--warning)" : b.category?.color} />
                      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                        <span>
                          {formatMoney(b.spent, currency)} of {formatMoney(b.amount, currency)}
                        </span>
                        <span className={cn("font-medium", left < 0 ? "text-danger" : "text-success")}>
                          {left < 0 ? `${formatMoney(-left, currency)} over` : `${formatMoney(left, currency)} left`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={PiggyBank} title="No budget set" description="Set a monthly limit to keep spending in check." className="py-6" />
            )}
          </CardContent>
        </Card>
      </section>

      <TransactionDialog open={txOpen} onOpenChange={setTxOpen} transaction={editing} />
      <BudgetDialog open={budgetOpen} onOpenChange={setBudgetOpen} month={monthKey} categories={expenseCats} />
    </>
  );
}
