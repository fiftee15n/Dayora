import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { format } from "date-fns";
import * as React from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { api, qs } from "../api";
import { useUser } from "../auth";
import { useSubmit } from "../forms";
import { Glyph } from "../icons";
import { invalidate, useQuery } from "../query";
import { useColors, useIsDark } from "../theme";
import type { Loan, LoanDetail, LoanDirection, LoanEntry, LoanList } from "../types";
import { Button, Chips, DateField, Empty, ErrorBox, Fab, Field, Input, Loading, Screen, Segmented, Sheet, confirm, errorMessage, toast } from "../ui";
import { PAYMENT_METHODS, formatMoney, initials, parseDateOnly, toISODate } from "../utils";

/* Loans — money you borrowed (I owe) and money you lent (Owed to me). Each person is a
   "folder" with its own history; repayments flow into Money as income/expense. */

export type LoansParams = { direction?: LoanDirection } | undefined;
export type LoanParams = { id: number };

const LOAN_PATHS = ["/api/loans", "/api/transactions", "/api/budgets", "/api/dashboard", "/api/activity"];

function refreshMoney() {
  invalidate(...LOAN_PATHS);
}

// ================================================================ list

export function LoansScreen({ route }: NativeStackScreenProps<{ Loans: LoansParams }, "Loans">) {
  const c = useColors();
  const nav = useNavigation<any>();
  const cur = useUser().currency;
  const [direction, setDirection] = React.useState<LoanDirection>(route.params?.direction ?? "borrowed");
  const [form, setForm] = React.useState(false);
  const list = useQuery<LoanList>(`/api/loans${qs({ direction })}`);
  const items = list.data?.items ?? [];
  const open = items.filter((l) => !l.settled);
  const settled = items.filter((l) => l.settled);
  const t = list.data?.totals;
  const owe = direction === "borrowed";

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Loans" subtitle="Money you borrowed and lent" back={() => nav.goBack()} refreshing={list.refreshing} onRefresh={list.refresh}>
        <Segmented
          options={[
            { value: "borrowed", label: "I owe" },
            { value: "lent", label: "Owed to me" },
          ]}
          value={direction}
          onChange={setDirection}
        />

        {t ? (
          <View style={{ backgroundColor: c.foreground, borderRadius: 24, padding: 20 }}>
            <Text style={{ color: c.background, opacity: 0.6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
              {owe ? "YOU STILL OWE" : "STILL OWED TO YOU"}
            </Text>
            <Text
              style={{ color: c.background, fontSize: 38, fontWeight: "800", letterSpacing: -1.2, marginTop: 6, fontVariant: ["tabular-nums"] }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatMoney(owe ? t.i_owe : t.owed_to_me, cur)}
            </Text>
            <Text style={{ color: c.background, opacity: 0.6, fontSize: 13, marginTop: 4 }}>
              {(owe ? t.open_borrowed : t.open_lent) === 0
                ? "Nothing open. All settled."
                : `${owe ? t.open_borrowed : t.open_lent} open · ${owe ? "money you borrowed" : "money you lent"}`}
            </Text>
          </View>
        ) : null}

        {list.error && !list.data ? <ErrorBox error={list.error} onRetry={list.refresh} /> : null}
        {list.loading && !list.data ? <Loading /> : null}

        {list.data && items.length === 0 ? (
          <Empty
            icon="users"
            title={owe ? "No borrowed money" : "No money lent"}
            text={
              owe
                ? "Borrowed from a friend? Add it here and record each repayment until it's paid off."
                : "Lent money to someone? Track what they've paid back and what's still owed."
            }
            action={owe ? "Add borrowed money" : "Add money lent"}
            onAction={() => setForm(true)}
          />
        ) : null}

        {open.map((l) => (
          <LoanCard key={l.id} loan={l} onPress={() => nav.navigate("Loan", { id: l.id })} />
        ))}
        {settled.length ? (
          <>
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginTop: 8 }}>SETTLED</Text>
            {settled.map((l) => (
              <LoanCard key={l.id} loan={l} onPress={() => nav.navigate("Loan", { id: l.id })} />
            ))}
          </>
        ) : null}
      </Screen>
      <Fab onPress={() => setForm(true)} />
      <LoanForm
        visible={form}
        direction={direction}
        onClose={() => setForm(false)}
        onCreated={(loan) => nav.navigate("Loan", { id: loan.id })}
      />
    </View>
  );
}

function LoanCard({ loan, onPress }: { loan: Loan; onPress: () => void }) {
  const c = useColors();
  const cur = useUser().currency;
  const pct = loan.principal > 0 ? Math.min(1, loan.paid / loan.principal) : 0;
  const overdue = !loan.settled && loan.due_date && parseDateOnly(loan.due_date) < new Date(new Date().toDateString());
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? c.muted : c.card,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        gap: 14,
        opacity: loan.settled ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "800" }}>{initials(loan.person)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{loan.person}</Text>
          <Text style={{ color: overdue ? c.danger : c.mutedForeground, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {loan.settled
              ? `Settled · ${formatMoney(loan.principal, cur, true)}`
              : loan.due_date
                ? `${overdue ? "Overdue" : "Due"} ${format(parseDateOnly(loan.due_date), "d MMM yyyy")}`
                : `${loan.direction === "borrowed" ? "Borrowed" : "Lent"} ${formatMoney(loan.principal, cur, true)}`}
          </Text>
        </View>
        {loan.settled ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: c.muted }}>
            <Glyph name="seal-check" size={14} weight="fill" />
            <Text style={{ color: c.foreground, fontSize: 11, fontWeight: "800" }}>Settled</Text>
          </View>
        ) : (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: c.foreground, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMoney(loan.remaining, cur, true)}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 11 }}>left</Text>
          </View>
        )}
      </View>
      {!loan.settled ? (
        <View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: "hidden" }}>
            <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 3, backgroundColor: c.foreground }} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: c.mutedForeground, fontSize: 11, fontVariant: ["tabular-nums"] }}>
              {formatMoney(loan.paid, cur, true)} paid back
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{Math.round(pct * 100)}%</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

// ================================================================ one person's folder

export function LoanDetailScreen({ route }: NativeStackScreenProps<{ Loan: LoanParams }, "Loan">) {
  const c = useColors();
  const nav = useNavigation<any>();
  const cur = useUser().currency;
  const q = useQuery<LoanDetail>(`/api/loans/${route.params.id}`);
  const loan = q.data;
  const [entrySheet, setEntrySheet] = React.useState<null | "payment" | "principal">(null);
  const [editing, setEditing] = React.useState(false);

  async function remove() {
    if (!loan) return;
    const ok = await confirm(
      "Delete this loan?",
      `Everything with ${loan.person} will be deleted, including its income and expense records in Money.`,
      "Delete loan",
    );
    if (!ok) return;
    try {
      await api(`/api/loans/${loan.id}`, { method: "DELETE" });
      refreshMoney();
      nav.goBack();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function removeEntry(e: LoanEntry) {
    if (!loan) return;
    const ok = await confirm(
      "Delete this entry?",
      `${formatMoney(e.amount, cur)} on ${format(parseDateOnly(e.date), "d MMM yyyy")}${e.transaction_id ? ", and its record in Money" : ""}.`,
      "Delete entry",
    );
    if (!ok) return;
    try {
      q.mutate(await api<LoanDetail>(`/api/loans/${loan.id}/entries/${e.id}`, { method: "DELETE" }));
      refreshMoney();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  const owe = loan?.direction === "borrowed";
  const pct = loan && loan.principal > 0 ? Math.min(1, loan.paid / loan.principal) : 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title={loan?.person ?? "Loan"}
        subtitle={loan ? (owe ? "Money you borrowed" : "Money you lent") : undefined}
        back={() => nav.goBack()}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
      >
        {q.error && !loan ? <ErrorBox error={q.error} onRetry={q.refresh} /> : null}
        {!loan && q.loading ? <Loading /> : null}
        {loan ? (
          <>
            {/* ---- balance */}
            <View style={{ backgroundColor: c.foreground, borderRadius: 26, padding: 20 }}>
              <Text style={{ color: c.background, opacity: 0.6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
                {loan.settled ? "SETTLED" : owe ? "YOU STILL OWE" : `${loan.person.toUpperCase()} STILL OWES YOU`}
              </Text>
              <Text style={{ color: c.background, fontSize: 40, fontWeight: "800", letterSpacing: -1.4, marginTop: 6, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(loan.remaining, cur)}
              </Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.background, opacity: 0.18, marginTop: 16 }} />
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.background, width: `${pct * 100}%`, marginTop: -6 }} />
              <View style={{ flexDirection: "row", marginTop: 16 }}>
                <HeroStat label={owe ? "Borrowed" : "Lent"} value={formatMoney(loan.principal, cur, true)} />
                <HeroStat label="Paid back" value={formatMoney(loan.paid, cur, true)} />
                <HeroStat label={loan.due_date ? "Due" : "Progress"} value={loan.due_date ? format(parseDateOnly(loan.due_date), "d MMM") : `${Math.round(pct * 100)}%`} last />
              </View>
            </View>

            {/* ---- actions */}
            {!loan.settled ? (
              <Button title={owe ? "Record a repayment" : "Record money received"} icon="plus" onPress={() => setEntrySheet("payment")} />
            ) : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title={owe ? "Borrowed more" : "Lent more"} variant="outline" style={{ flex: 1 }} onPress={() => setEntrySheet("principal")} />
              <Button title="Edit" variant="outline" icon="edit-2" style={{ flex: 1 }} onPress={() => setEditing(true)} />
            </View>
            {loan.note ? <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>{loan.note}</Text> : null}

            {/* ---- history */}
            <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "800", letterSpacing: -0.4, marginTop: 8 }}>History</Text>
            <View style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
              {loan.entries.map((e, i) => (
                <EntryRow key={e.id} entry={e} direction={loan.direction} first={i === 0} onLongPress={() => removeEntry(e)} />
              ))}
            </View>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Press and hold an entry to delete it.</Text>

            <Pressable onPress={remove} hitSlop={8} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
              <Glyph name="trash" size={16} color={c.danger} weight="bold" />
              <Text style={{ color: c.danger, fontSize: 14, fontWeight: "700" }}>Delete loan</Text>
            </Pressable>
          </>
        ) : null}
      </Screen>

      {loan ? (
        <>
          <LoanEntryForm
            visible={!!entrySheet}
            kind={entrySheet ?? "payment"}
            loan={loan}
            onClose={() => setEntrySheet(null)}
            onSaved={(d) => q.mutate(d)}
          />
          <LoanEditForm visible={editing} loan={loan} onClose={() => setEditing(false)} onSaved={(d) => q.mutate(d)} />
        </>
      ) : null}
    </View>
  );
}

function HeroStat({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, borderRightWidth: last ? 0 : 1, borderRightColor: "rgba(127,127,127,0.3)", marginRight: last ? 0 : 12 }}>
      <Text style={{ color: c.background, opacity: 0.6, fontSize: 11, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: c.background, fontSize: 16, fontWeight: "800", marginTop: 3, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function EntryRow({ entry, direction, first, onLongPress }: { entry: LoanEntry; direction: LoanDirection; first: boolean; onLongPress: () => void }) {
  const c = useColors();
  const cur = useUser().currency;
  const payment = entry.kind === "payment";
  const label = payment ? (direction === "borrowed" ? "You repaid" : "They paid back") : direction === "borrowed" ? "You borrowed" : "You lent";
  // Money in or out of your pocket, matching how it's recorded in Money.
  const moneyIn = (direction === "borrowed") === !payment;
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
        !first && { borderTopWidth: 1, borderTopColor: c.border },
        pressed && { backgroundColor: c.muted },
      ]}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: payment ? c.foreground : c.muted, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={moneyIn ? "arrow-in" : "arrow-out"} size={18} weight="bold" color={payment ? c.background : c.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>{label}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {format(parseDateOnly(entry.date), "d MMM yyyy")}
          {entry.note ? ` · ${entry.note}` : ""}
          {entry.transaction_id ? "" : " · not in Money"}
        </Text>
      </View>
      <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
        {moneyIn ? "+" : "−"}
        {formatMoney(entry.amount, cur)}
      </Text>
    </Pressable>
  );
}

// ================================================================ forms

function RecordInMoney({ value, onChange, hint }: { value: boolean; onChange: (v: boolean) => void; hint: string }) {
  const c = useColors();
  const dark = useIsDark();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }}>Add to monthly Money</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.input, true: c.foreground }}
        thumbColor={dark ? (value ? "#0A0A0A" : "#A3A3A3") : "#FFFFFF"}
      />
    </View>
  );
}

function parseAmount(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function LoanForm({
  visible,
  direction: initialDirection,
  onClose,
  onCreated,
}: {
  visible: boolean;
  direction: LoanDirection;
  onClose: () => void;
  onCreated: (l: LoanDetail) => void;
}) {
  const cur = useUser().currency;
  const [direction, setDirection] = React.useState<LoanDirection>(initialDirection);
  const [person, setPerson] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date());
  const [due, setDue] = React.useState<Date | null>(null);
  const [note, setNote] = React.useState("");
  const [record, setRecord] = React.useState(true);
  const [method, setMethod] = React.useState("cash");
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setDirection(initialDirection);
    setPerson("");
    setAmount("");
    setDate(new Date());
    setDue(null);
    setNote("");
    setRecord(true);
    setMethod("cash");
    setErrors({});
  }, [visible, initialDirection, setErrors]);

  const owe = direction === "borrowed";
  const save = () =>
    run(async () => {
      const e: Record<string, string> = {};
      const value = parseAmount(amount);
      if (!person.trim()) e.person = "Who is it with?";
      if (!(value > 0)) e.amount = "Enter an amount";
      if (Object.keys(e).length) return setErrors(e);
      const loan = await api<LoanDetail>("/api/loans", {
        method: "POST",
        json: {
          person: person.trim(),
          direction,
          amount: value,
          date: toISODate(date),
          due_date: due ? toISODate(due) : null,
          note: note.trim() || null,
          record_in_money: record,
          payment_method: method,
        },
      });
      refreshMoney();
      toast(owe ? `Borrowed from ${loan.person} added` : `Money lent to ${loan.person} added`);
      onClose();
      onCreated(loan);
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={owe ? "Money I borrowed" : "Money I lent"} footer={<Button title="Save" onPress={save} loading={saving} />}>
      <Segmented
        options={[
          { value: "borrowed", label: "I borrowed" },
          { value: "lent", label: "I lent" },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <Input label={owe ? "Borrowed from" : "Lent to"} value={person} onChangeText={setPerson} placeholder="Friend's name" error={errors.person} autoCapitalize="words" />
      <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} />
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} />
      <DateField label="Pay back by (optional)" value={due} onChange={setDue} clearable />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="What it was for (optional)" />
      <RecordInMoney
        value={record}
        onChange={setRecord}
        hint={owe ? "Counts as income this month. Repayments count as expenses." : "Counts as an expense this month. Money paid back counts as income."}
      />
      {record ? (
        <Field label="Payment method">
          <Chips options={PAYMENT_METHODS} value={method} onChange={setMethod} />
        </Field>
      ) : null}
    </Sheet>
  );
}

function LoanEntryForm({
  visible,
  kind,
  loan,
  onClose,
  onSaved,
}: {
  visible: boolean;
  kind: "payment" | "principal";
  loan: LoanDetail;
  onClose: () => void;
  onSaved: (l: LoanDetail) => void;
}) {
  const c = useColors();
  const cur = useUser().currency;
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(new Date());
  const [note, setNote] = React.useState("");
  const [record, setRecord] = React.useState(true);
  const [method, setMethod] = React.useState("cash");
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setAmount("");
    setDate(new Date());
    setNote("");
    setRecord(true);
    setMethod("cash");
    setErrors({});
  }, [visible, setErrors]);

  const owe = loan.direction === "borrowed";
  const payment = kind === "payment";
  const title = payment ? (owe ? `Repay ${loan.person}` : `${loan.person} paid back`) : owe ? `Borrowed more from ${loan.person}` : `Lent more to ${loan.person}`;

  const save = () =>
    run(async () => {
      const value = parseAmount(amount);
      if (!(value > 0)) return setErrors({ amount: "Enter an amount" });
      if (payment && value > loan.remaining + 0.005) return setErrors({ amount: `Only ${formatMoney(loan.remaining, cur)} is left` });
      const updated = await api<LoanDetail>(`/api/loans/${loan.id}/entries`, {
        method: "POST",
        json: { kind, amount: value, date: toISODate(date), note: note.trim() || null, record_in_money: record, payment_method: method },
      });
      refreshMoney();
      onSaved(updated);
      toast(updated.settled ? "Fully paid. Loan settled!" : `${formatMoney(updated.remaining, cur)} left`);
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={title} footer={<Button title="Save" onPress={save} loading={saving} />}>
      <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} autoFocus />
      {payment && loan.remaining > 0 ? (
        <Pressable
          onPress={() => setAmount(String(loan.remaining))}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            height: 32,
            borderRadius: 16,
            justifyContent: "center",
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: pressed ? c.muted : c.card,
          })}
        >
          <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "700" }}>Pay it all · {formatMoney(loan.remaining, cur)}</Text>
        </Pressable>
      ) : null}
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
      <RecordInMoney
        value={record}
        onChange={setRecord}
        hint={(owe ? !payment : payment) ? "Counts as income this month." : "Counts as an expense this month."}
      />
      {record ? (
        <Field label="Payment method">
          <Chips options={PAYMENT_METHODS} value={method} onChange={setMethod} />
        </Field>
      ) : null}
    </Sheet>
  );
}

function LoanEditForm({ visible, loan, onClose, onSaved }: { visible: boolean; loan: LoanDetail; onClose: () => void; onSaved: (l: LoanDetail) => void }) {
  const [person, setPerson] = React.useState(loan.person);
  const [note, setNote] = React.useState(loan.note ?? "");
  const [due, setDue] = React.useState<Date | null>(loan.due_date ? parseDateOnly(loan.due_date) : null);
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setPerson(loan.person);
    setNote(loan.note ?? "");
    setDue(loan.due_date ? parseDateOnly(loan.due_date) : null);
    setErrors({});
  }, [visible, loan, setErrors]);

  const save = () =>
    run(async () => {
      if (!person.trim()) return setErrors({ person: "Enter a name" });
      const updated = await api<LoanDetail>(`/api/loans/${loan.id}`, {
        method: "PATCH",
        json: { person: person.trim(), note: note.trim() || null, due_date: due ? toISODate(due) : null },
      });
      invalidate("/api/loans");
      onSaved(updated);
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit loan" footer={<Button title="Save changes" onPress={save} loading={saving} />}>
      <Input label="Name" value={person} onChangeText={setPerson} error={errors.person} autoCapitalize="words" />
      <DateField label="Pay back by" value={due} onChange={setDue} clearable />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="Optional" multiline />
    </Sheet>
  );
}
