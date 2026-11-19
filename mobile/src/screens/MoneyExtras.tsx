import { useNavigation } from "@react-navigation/native";
import { format } from "date-fns/format";
import * as React from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "../api";
import { useUser } from "../auth";
import { useSubmit } from "../forms";
import { Glyph } from "../icons";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import type { ExpenseCategory, IncomeSource, LoanList, Transaction } from "../types";
import { Button, Chips, DateField, Field, Input, Sheet, confirm, errorMessage, toast } from "../ui";
import { PAYMENT_METHODS, formatMoney, parseDateOnly, toISODate } from "../utils";

/* Two cards for the Money tab: a summary of loans (opens the Loans folders) and
   "Quick income" — saved income sources you add with a tap. */

// ================================================================ loans summary

export function LoansSummaryCard() {
  const c = useColors();
  const nav = useNavigation<any>();
  const cur = useUser().currency;
  const { data } = useQuery<LoanList>("/api/loans");
  const t = data?.totals;

  const tile = (direction: "borrowed" | "lent", label: string, amount: number, open: number) => (
    <Pressable
      onPress={() => nav.navigate("Loans", { direction })}
      style={({ pressed }) => ({ flex: 1, padding: 14, borderRadius: 18, backgroundColor: pressed ? c.border : c.muted })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Glyph name={direction === "borrowed" ? "arrow-out" : "arrow-in"} size={14} weight="bold" />
        <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      </View>
      <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "800", letterSpacing: -0.5, marginTop: 8, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(amount, cur, true)}
      </Text>
      <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}>{open ? `${open} open` : "None open"}</Text>
    </Pressable>
  );

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 16, gap: 14 }}>
      <Pressable onPress={() => nav.navigate("Loans")} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Glyph name="users" size={20} />
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "800" }}>Loans</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontWeight: "600" }}>Open</Text>
          <Glyph name="caret-right" size={13} color={c.mutedForeground} weight="bold" />
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {tile("borrowed", "I owe", t?.i_owe ?? 0, t?.open_borrowed ?? 0)}
        {tile("lent", "Owed to me", t?.owed_to_me ?? 0, t?.open_lent ?? 0)}
      </View>
    </View>
  );
}

// ================================================================ quick income

/**
 * Quick income: a monthly checklist of saved sources. Tap to tick = income added today;
 * tap a ticked one to undo. Ticks reset each month.
 */
export function QuickIncomeCard() {
  const c = useColors();
  const cur = useUser().currency;
  const { data: sources, mutate } = useQuery<IncomeSource[]>("/api/income-sources");
  const [busy, setBusy] = React.useState<number | null>(null);
  const [needsAmount, setNeedsAmount] = React.useState<IncomeSource | null>(null);
  const [editing, setEditing] = React.useState<{ open: boolean; source?: IncomeSource | null }>({ open: false });
  const monthName = format(new Date(), "MMMM");
  const done = (sources ?? []).filter((s) => s.this_month_transaction_id).length;

  function afterChange() {
    invalidate("/api/income-sources", "/api/transactions", "/api/dashboard", "/api/activity", "/api/budgets");
  }

  async function tick(s: IncomeSource) {
    if (busy) return;
    if (s.this_month_transaction_id) return untick(s);
    if (!s.amount) return setNeedsAmount(s); // no saved amount: ask once
    setBusy(s.id);
    try {
      const tx = await api<Transaction>(`/api/income-sources/${s.id}/add`, { method: "POST", json: {} });
      if (sources) mutate(sources.map((x) => (x.id === s.id ? { ...x, this_month_transaction_id: tx.id, this_month_amount: tx.amount, this_month_date: tx.date } : x)));
      toast(`Added ${formatMoney(tx.amount, cur)} · ${s.name}`);
      afterChange();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function untick(s: IncomeSource) {
    const when = s.this_month_date ? format(parseDateOnly(s.this_month_date), "d MMM") : "this month";
    const ok = await confirm(
      `Undo ${s.name}?`,
      `${formatMoney(s.this_month_amount ?? 0, cur)} added on ${when} will be removed from ${monthName}'s income. You can tick it again any time.`,
      "Undo",
      false,
      "undo",
    );
    if (!ok) return;
    setBusy(s.id);
    try {
      await api(`/api/transactions/${s.this_month_transaction_id}`, { method: "DELETE" });
      if (sources) mutate(sources.map((x) => (x.id === s.id ? { ...x, this_month_transaction_id: null, this_month_amount: null, this_month_date: null } : x)));
      afterChange();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 12 }}>
        <View>
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "800" }}>Quick income</Text>
          {sources?.length ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 3 }}>
              {done} of {sources.length} added for {monthName}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={() => setEditing({ open: true, source: null })} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Glyph name="plus" size={14} weight="bold" />
          <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "700" }}>New source</Text>
        </Pressable>
      </View>

      {sources && sources.length === 0 ? (
        <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingBottom: 16 }}>
          Save where your money comes from, like your salary or rent. Then each month just tick it, and it's added to your income with today's date.
        </Text>
      ) : null}

      {(sources ?? []).map((s) => {
        const ticked = !!s.this_month_transaction_id;
        return (
          <Pressable
            key={s.id}
            onPress={() => tick(s)}
            onLongPress={() => setEditing({ open: true, source: s })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ticked, busy: busy === s.id }}
            accessibilityLabel={`${s.name}, ${ticked ? "added" : "not added"} for ${monthName}`}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingHorizontal: 16,
              paddingVertical: 13,
              borderTopWidth: 1,
              borderTopColor: c.border,
              backgroundColor: pressed ? c.muted : "transparent",
            })}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: ticked ? c.foreground : "transparent",
                borderWidth: ticked ? 0 : 1.5,
                borderColor: c.input,
                opacity: busy === s.id ? 0.4 : 1,
              }}
            >
              {ticked ? <Glyph name="check" size={15} weight="bold" color={c.background} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>{s.name}</Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                {ticked && s.this_month_date
                  ? `Added ${format(parseDateOnly(s.this_month_date), "d MMM")}`
                  : s.amount
                    ? `Tap to add for ${monthName}`
                    : "Tap to enter this month's amount"}
              </Text>
            </View>
            <Text
              style={{
                color: ticked ? c.foreground : c.mutedForeground,
                fontSize: 15,
                fontWeight: "800",
                fontVariant: ["tabular-nums"],
              }}
            >
              {ticked ? formatMoney(s.this_month_amount ?? 0, cur) : s.amount ? formatMoney(s.amount, cur) : "—"}
            </Text>
          </Pressable>
        );
      })}
      {sources?.length ? (
        <Text style={{ color: c.mutedForeground, fontSize: 11, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
          Tap to tick · tap again to undo · press and hold to edit
        </Text>
      ) : null}

      <QuickAddSheet source={needsAmount} onClose={() => setNeedsAmount(null)} />
      <IncomeSourceForm visible={editing.open} source={editing.source} onClose={() => setEditing({ open: false })} />
    </View>
  );
}

/** For a source with no saved amount: enter this month's amount, then record it. */
function QuickAddSheet({ source, onClose }: { source: IncomeSource | null; onClose: () => void }) {
  const cur = useUser().currency;
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date());
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!source) return;
    setAmount(source.amount ? String(source.amount) : "");
    setDate(new Date());
    setErrors({});
  }, [source, setErrors]);

  const value = Number(amount.replace(/,/g, ""));
  const save = () =>
    run(async () => {
      if (!source) return;
      if (!(value > 0)) return setErrors({ amount: "Enter an amount" });
      const tx = await api<Transaction>(`/api/income-sources/${source.id}/add`, {
        method: "POST",
        json: { amount: value, date: toISODate(date) },
      });
      invalidate("/api/income-sources", "/api/transactions", "/api/dashboard", "/api/activity", "/api/budgets");
      toast(`Added ${formatMoney(tx.amount, cur)} from ${source.name}`);
      onClose();
    });

  return (
    <Sheet
      visible={!!source}
      onClose={onClose}
      title={source ? `Add ${source.name}` : ""}
      footer={<Button title={value > 0 ? `Add ${formatMoney(value, cur)} income` : "Add income"} onPress={save} loading={saving} />}
    >
      <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} autoFocus={!source?.amount} />
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} />
    </Sheet>
  );
}

function IncomeSourceForm({ visible, source, onClose }: { visible: boolean; source?: IncomeSource | null; onClose: () => void }) {
  const c = useColors();
  const cur = useUser().currency;
  const { data: cats } = useQuery<ExpenseCategory[]>(visible ? "/api/categories/expenses" : null);
  const incomeCats = (cats ?? []).filter((x) => x.kind === "income");
  const [name, setName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<number | null>(null);
  const [method, setMethod] = React.useState("bank");
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setName(source?.name ?? "");
    setAmount(source?.amount ? String(source.amount) : "");
    setCategoryId(source?.category_id ?? null);
    setMethod(source?.payment_method ?? "bank");
    setErrors({});
  }, [visible, source, setErrors]);

  const save = () =>
    run(async () => {
      if (!name.trim()) return setErrors({ name: "Give it a name" });
      const n = amount.trim() ? Number(amount.replace(/,/g, "")) : null;
      if (n !== null && !(n > 0)) return setErrors({ amount: "Enter a valid amount, or leave it empty" });
      const json = { name: name.trim(), amount: n, category_id: categoryId, payment_method: method };
      if (source) await api(`/api/income-sources/${source.id}`, { method: "PATCH", json });
      else await api("/api/income-sources", { method: "POST", json });
      invalidate("/api/income-sources");
      toast(source ? "Source updated" : "Source saved");
      onClose();
    });

  async function remove() {
    if (!source || !(await confirm("Delete source?", `"${source.name}" will be removed. Income you already added stays.`))) return;
    try {
      await api(`/api/income-sources/${source.id}`, { method: "DELETE" });
      invalidate("/api/income-sources");
      onClose();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={source ? "Edit income source" : "New income source"} footer={<Button title="Save" onPress={save} loading={saving} />}>
      <Input label="Name" value={name} onChangeText={setName} placeholder="e.g. Office salary" error={errors.name} />
      <Input
        label={`Usual amount (${cur})`}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Needed for one-tap ticking"
        error={errors.amount}
      />
      <Field label="Category">
        <Chips
          options={[{ value: null, label: "None" }, ...incomeCats.map((x) => ({ value: x.id as number | null, label: x.name, color: x.color }))]}
          value={categoryId}
          onChange={setCategoryId}
        />
      </Field>
      <Field label="Comes in as">
        <Chips options={PAYMENT_METHODS} value={method} onChange={setMethod} />
      </Field>
      {source ? (
        <Pressable onPress={remove} style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
          <Glyph name="trash" size={16} color={c.danger} weight="bold" />
          <Text style={{ color: c.danger, fontSize: 14, fontWeight: "700" }}>Delete source</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}
