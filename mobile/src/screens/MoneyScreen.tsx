import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import * as React from "react";
import { Pressable, View } from "react-native";

import { api, qs } from "../api";
import { useUser } from "../auth";
import { BarChart, Donut } from "../charts";
import { BudgetForm, TransactionForm } from "../forms";
import { LoansSummaryCard, QuickIncomeCard } from "./MoneyExtras";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { Budget, FinanceSummary, Page, Transaction, TxType } from "../types";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Empty,
  ErrorBox,
  Fab,
  Icon,
  IconButton,
  IconTile,
  Input,
  Loading,
  MonthPicker,
  Progress,
  Row,
  Screen,
  Segmented,
  T,
  confirm,
  errorMessage,
  toast,
} from "../ui";
import { PAYMENT_METHODS, formatMoney, friendlyDay, parseDateOnly, toISODate } from "../utils";

export function MoneyScreen() {
  const c = useColors();
  const user = useUser();
  const cur = user.currency;
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [type, setType] = React.useState<"all" | TxType>("all");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<Transaction[]>([]);
  const [txSheet, setTxSheet] = React.useState<{ open: boolean; tx?: Transaction | null }>({ open: false });
  const [budgetSheet, setBudgetSheet] = React.useState<{ open: boolean; budget?: Budget | null }>({ open: false });

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const start = toISODate(month);
  const end = toISODate(endOfMonth(month));
  const monthKey = format(month, "yyyy-MM");

  const summary = useQuery<FinanceSummary>(`/api/transactions/summary${qs({ start, end })}`);
  const budgets = useQuery<Budget[]>(`/api/budgets?month=${monthKey}`);
  const txPath = `/api/transactions${qs({ start, end, type, q: search, page, page_size: 20 })}`;
  const txs = useQuery<Page<Transaction>>(txPath);

  // Accumulate pages; reset when filters change.
  React.useEffect(() => setPage(1), [start, type, search]);
  React.useEffect(() => {
    if (!txs.data) return;
    setItems((prev) => (txs.data!.page === 1 ? txs.data!.items : [...prev.filter((p) => !txs.data!.items.some((n) => n.id === p.id)), ...txs.data!.items]));
  }, [txs.data]);

  function refresh() {
    setPage(1);
    summary.refresh();
    budgets.refresh();
    txs.refresh();
  }

  async function removeTx(tx: Transaction) {
    if (!(await confirm("Delete transaction?", `${formatMoney(tx.amount, cur)} · ${tx.description || tx.category?.name || tx.type}`))) return;
    try {
      await api(`/api/transactions/${tx.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((p) => p.id !== tx.id));
      invalidate("/api/transactions", "/api/budgets", "/api/dashboard", "/api/activity", "/api/income-sources", "/api/loans");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function removeBudget(b: Budget) {
    if (!(await confirm("Remove budget?", `${b.category?.name ?? "Overall"} budget for ${format(month, "MMMM")}`))) return;
    try {
      await api(`/api/budgets/${b.id}`, { method: "DELETE" });
      invalidate("/api/budgets", "/api/dashboard");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const s = summary.data;
  const total = txs.data?.total ?? 0;
  const isCurrent = monthKey === format(new Date(), "yyyy-MM");

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Money" subtitle="Income, spending & budgets" refreshing={summary.refreshing || txs.refreshing} onRefresh={refresh}>
        <MonthPicker value={month} onChange={setMonth} />

        {summary.error && !s ? <ErrorBox error={summary.error} onRetry={refresh} /> : null}
        {summary.loading ? <Loading /> : null}

        {s ? (
          <>
            <Row gap={10}>
              <SumTile label="Income" value={formatMoney(s.income, cur, true)} color={c.success} icon="arrow-down-left" />
              <SumTile label="Expenses" value={formatMoney(s.expense, cur, true)} color={c.danger} icon="arrow-up-right" />
              <SumTile label="Balance" value={formatMoney(s.balance, cur, true)} color={s.balance >= 0 ? c.primary : c.danger} icon="pie-chart" />
            </Row>

            <QuickIncomeCard />
            <LoansSummaryCard />

            <Card style={{ gap: 14 }}>
              <CardHeader title="Spending by category" />
              {s.by_category.length === 0 ? (
                <T variant="small" muted>No expenses this month.</T>
              ) : (
                <Row gap={16} style={{ alignItems: "center" }}>
                  <Donut
                    data={s.by_category.map((x) => ({ value: x.total, color: x.color }))}
                    size={130}
                    stroke={20}
                    center={
                      <View style={{ alignItems: "center" }}>
                        <T variant="caption" muted>Spent</T>
                        <T variant="h3">{formatMoney(s.expense, cur, true)}</T>
                      </View>
                    }
                  />
                  <View style={{ flex: 1, gap: 8 }}>
                    {s.by_category.slice(0, 5).map((x) => (
                      <Row key={String(x.category_id)} gap={8}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.color }} />
                        <T variant="small" style={{ flex: 1 }} numberOfLines={1}>{x.name}</T>
                        <T variant="caption" muted>{Math.round(x.percent)}%</T>
                      </Row>
                    ))}
                  </View>
                </Row>
              )}
              {s.top_category ? (
                <T variant="small" muted>
                  Highest spending: <T variant="small" weight="700">{s.top_category.name}</T> · {formatMoney(s.top_category.total, cur)}
                </T>
              ) : null}
            </Card>

            <Card style={{ gap: 14 }}>
              <CardHeader title="Daily cash flow" />
              <BarChart
                labels={s.daily.map((d) => format(parseDateOnly(d.date), "d"))}
                series={[
                  { name: "Income", color: c.success, values: s.daily.map((d) => d.income) },
                  { name: "Expense", color: c.danger, values: s.daily.map((d) => d.expense) },
                ]}
                height={110}
                format={(v) => formatMoney(v, cur, true)}
              />
            </Card>
          </>
        ) : null}

        <Card style={{ gap: 14 }}>
          <CardHeader title="Budgets" action="Add" onAction={() => setBudgetSheet({ open: true, budget: null })} />
          {budgets.data && budgets.data.length === 0 ? <T variant="small" muted>No budgets for {format(month, "MMMM")}. Set a monthly limit to track spending.</T> : null}
          {budgets.data?.map((b) => {
            const pct = (b.spent / b.amount) * 100;
            const col = pct > 100 ? c.danger : pct > 80 ? c.warning : c.success;
            return (
              <Pressable key={b.id} onPress={() => setBudgetSheet({ open: true, budget: b })} onLongPress={() => removeBudget(b)} style={{ gap: 8 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Row gap={8} style={{ flex: 1 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: b.category?.color ?? c.primary }} />
                    <T weight="600" numberOfLines={1} style={{ flex: 1 }}>{b.category?.name ?? "Overall"}</T>
                  </Row>
                  <T variant="caption" muted>{formatMoney(b.spent, cur, true)} / {formatMoney(b.amount, cur, true)}</T>
                </Row>
                <Progress value={pct} color={col} />
                {pct > 100 ? <T variant="caption" color={c.danger}>Over by {formatMoney(b.spent - b.amount, cur)}</T> : null}
              </Pressable>
            );
          })}
          {budgets.data?.length ? <T variant="caption" muted>Tap to edit · long-press to remove</T> : null}
        </Card>

        <CardHeader title="Transactions" />
        <Input value={q} onChangeText={setQ} placeholder="Search descriptions" right={<Icon name="search" size={18} color={c.mutedForeground} />} />
        <Segmented
          options={[
            { value: "all", label: "All" },
            { value: "expense", label: "Expenses" },
            { value: "income", label: "Income" },
          ]}
          value={type}
          onChange={setType}
        />
        {txs.error && !txs.data ? <ErrorBox error={txs.error} onRetry={txs.refresh} /> : null}
        {txs.data && items.length === 0 ? (
          <Empty icon="credit-card" title="No transactions" text="Record income and expenses to see them here." action="Add transaction" onAction={() => setTxSheet({ open: true, tx: null })} />
        ) : null}
        {items.length ? (
          <Card style={{ padding: 6 }}>
            {items.map((tx, i) => (
              <Pressable
                key={tx.id}
                onPress={() => setTxSheet({ open: true, tx })}
                onLongPress={() => removeTx(tx)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderTopWidth: i ? 1 : 0, borderColor: c.border }}
              >
                <IconTile name={tx.type === "income" ? "arrow-down-left" : "shopping-bag"} color={tx.category?.color ?? (tx.type === "income" ? c.success : c.mutedForeground)} size={38} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T weight="600" numberOfLines={1}>{tx.description || tx.category?.name || (tx.type === "income" ? "Income" : "Expense")}</T>
                  <Row gap={6}>
                    <T variant="caption" muted>{friendlyDay(parseDateOnly(tx.date))}</T>
                    {tx.category && tx.description ? <Badge label={tx.category.name} color={tx.category.color} /> : null}
                    <T variant="caption" muted>· {PAYMENT_METHODS.find((p) => p.value === tx.payment_method)?.label ?? tx.payment_method}</T>
                  </Row>
                </View>
                <T weight="700" color={tx.type === "income" ? c.success : c.foreground}>
                  {tx.type === "income" ? "+" : "−"}
                  {formatMoney(tx.amount, cur)}
                </T>
              </Pressable>
            ))}
          </Card>
        ) : null}
        {items.length > 0 && items.length < total ? (
          <Button title="Load more" variant="outline" onPress={() => setPage(page + 1)} loading={txs.loading || txs.refreshing} />
        ) : null}
        {items.length ? <T variant="caption" muted style={{ textAlign: "center" }}>Tap to edit · long-press to delete</T> : null}
      </Screen>
      <Fab onPress={() => setTxSheet({ open: true, tx: null })} />
      <TransactionForm visible={txSheet.open} transaction={txSheet.tx} onClose={() => setTxSheet({ open: false })} />
      <BudgetForm visible={budgetSheet.open} budget={budgetSheet.budget} month={monthKey} onClose={() => setBudgetSheet({ open: false })} />
    </View>
  );
}

function SumTile({ label, value, color, icon }: { label: string; value: string; color: string; icon: React.ComponentProps<typeof Icon>["name"] }) {
  return (
    <Card style={{ flex: 1, padding: 12, gap: 8 }}>
      <IconTile name={icon} color={color} size={30} />
      <View>
        <T variant="h3" color={color} numberOfLines={1} adjustsFontSizeToFit>{value}</T>
        <T variant="caption" muted>{label}</T>
      </View>
    </Card>
  );
}
