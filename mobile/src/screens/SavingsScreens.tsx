import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { format } from "date-fns/format";
import * as React from "react";
import { Pressable, Switch, Text, View } from "react-native";

import { api } from "../api";
import { useUser } from "../auth";
import { useSubmit } from "../forms";
import { Glyph } from "../icons";
import { invalidate, useQuery } from "../query";
import { useColors, useIsDark } from "../theme";
import type { SavingsEntry, SavingsGoal, SavingsGoalDetail, SavingsList } from "../types";
import { Button, Chips, DateField, ErrorBox, Field, Input, Loading, Screen, Sheet, confirm, errorMessage, toast } from "../ui";
import { PAYMENT_METHODS, formatMoney, parseDateOnly, toISODate } from "../utils";

/* Savings goals: money put aside for a purpose ("New laptop") against an approximate target.
   Putting money in records an expense (it leaves the balance); taking it out records income. */

export type SavingsGoalParams = { id: number };

function refreshMoney() {
  invalidate("/api/savings", "/api/transactions", "/api/budgets", "/api/dashboard", "/api/activity");
}

function parseAmount(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function ProgressBar({ value, height = 6, onDark }: { value: number; height?: number; onDark?: boolean }) {
  const c = useColors();
  // On the dark card the track is a translucent grey and the fill is the card's text colour.
  const track = onDark ? "rgba(127,127,127,0.35)" : c.muted;
  const fill = onDark ? c.background : c.foreground;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", borderRadius: height / 2, backgroundColor: fill }} />
    </View>
  );
}

// ================================================================ card on the Money tab

/** Savings card: totals, "balance after saving", and each goal with a quick "+ Save" button. */
export function SavingsCard({ balance }: { balance: number }) {
  const c = useColors();
  const nav = useNavigation<any>();
  const cur = useUser().currency;
  const { data } = useQuery<SavingsList>("/api/savings");
  const [newGoal, setNewGoal] = React.useState(false);
  const [saveTo, setSaveTo] = React.useState<SavingsGoal | null>(null);
  const goals = data?.items ?? [];
  const t = data?.totals;

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      <View style={{ padding: 16, paddingBottom: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "800" }}>Savings</Text>
          <Pressable onPress={() => setNewGoal(true)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Glyph name="plus" size={14} weight="bold" />
            <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "700" }}>New goal</Text>
          </Pressable>
        </View>

        {t && goals.length ? (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.foreground }}>
              <Text style={{ color: c.background, opacity: 0.65, fontSize: 12, fontWeight: "700" }}>Total saved</Text>
              <Text style={{ color: c.background, fontSize: 20, fontWeight: "800", marginTop: 8, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(t.saved, cur)}
              </Text>
              <Text style={{ color: c.background, opacity: 0.65, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                {t.this_month >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(t.this_month), cur, true)} this month
              </Text>
            </View>
            <View style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.muted }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "700" }}>Balance after saving</Text>
              <Text
                style={{ color: balance < 0 ? c.danger : c.foreground, fontSize: 20, fontWeight: "800", marginTop: 8, fontVariant: ["tabular-nums"] }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatMoney(balance, cur)}
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                left to spend this month
              </Text>
            </View>
          </View>
        ) : null}

        {data && goals.length === 0 ? (
          <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 8 }}>
            Saving for something? Create a goal like "New laptop" with a rough target, then add money to it bit by bit. What
            you save comes off your balance, so you always see what's really left to spend.
          </Text>
        ) : null}
      </View>

      {goals.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => nav.navigate("SavingsGoal", { id: g.id })}
          style={({ pressed }) => ({ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: pressed ? c.muted : "transparent" })}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
              <Glyph name={g.completed_on || g.reached ? "seal-check" : "piggy"} size={22} weight={g.completed_on || g.reached ? "fill" : "duotone"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: g.completed_on ? c.mutedForeground : c.foreground, fontSize: 15, fontWeight: "700" }}
                numberOfLines={1}
              >
                {g.name}
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] }} numberOfLines={1}>
                {g.completed_on ? (
                  <>
                    Completed · spent {formatMoney(g.spent ?? 0, cur)}
                    {(g.leftover ?? 0) > 0 ? ` · ${formatMoney(g.leftover ?? 0, cur)} back` : ""}
                  </>
                ) : (
                  <>
                    {formatMoney(g.saved, cur)}
                    {g.target ? ` of ${formatMoney(g.target, cur)}` : " saved"}
                    {g.reached ? " · reached" : ""}
                  </>
                )}
              </Text>
            </View>
            {g.completed_on ? null : <Pressable
              onPress={() => setSaveTo(g)}
              hitSlop={6}
              accessibilityLabel={`Add savings to ${g.name}`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 12,
                height: 32,
                borderRadius: 16,
                backgroundColor: pressed ? c.accent : c.foreground,
              })}
            >
              <Glyph name="plus" size={12} weight="bold" color={c.background} />
              <Text style={{ color: c.background, fontSize: 12, fontWeight: "800" }}>Save</Text>
            </Pressable>}
          </View>
          {g.target && !g.completed_on ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={g.progress ?? 0} />
              </View>
              <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700", width: 38, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                {Math.round(g.progress ?? 0)}%
              </Text>
            </View>
          ) : null}
        </Pressable>
      ))}

      <GoalForm visible={newGoal} onClose={() => setNewGoal(false)} onSaved={(g) => nav.navigate("SavingsGoal", { id: g.id })} />
      {saveTo ? <EntryForm visible kind="deposit" goal={saveTo} onClose={() => setSaveTo(null)} /> : null}
    </View>
  );
}

// ================================================================ one goal

export function SavingsGoalScreen({ route }: NativeStackScreenProps<{ SavingsGoal: SavingsGoalParams }, "SavingsGoal">) {
  const c = useColors();
  const nav = useNavigation<any>();
  const cur = useUser().currency;
  const q = useQuery<SavingsGoalDetail>(`/api/savings/${route.params.id}`);
  const g = q.data;
  const [entry, setEntry] = React.useState<null | "deposit" | "withdraw">(null);
  const [editing, setEditing] = React.useState(false);
  const [completing, setCompleting] = React.useState(false);
  const done = !!g?.completed_on;

  async function reopen() {
    if (!g) return;
    const back = g.leftover ?? 0;
    const ok = await confirm(
      "Reopen this goal?",
      Math.abs(back) > 0.005
        ? back > 0
          ? `The ${formatMoney(back, cur)} that went back to your balance returns to the goal.`
          : `The extra ${formatMoney(-back, cur)} recorded as spent is removed.`
        : "You can add or take out savings again.",
      "Reopen",
    );
    if (!ok) return;
    try {
      q.mutate(await api<SavingsGoalDetail>(`/api/savings/${g.id}/reopen`, { method: "POST" }));
      refreshMoney();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function removeGoal() {
    if (!g) return;
    const ok = await confirm(
      "Delete this goal?",
      g.completed_on
        ? `"${g.name}" and its history will be deleted. What you spent stays in Money.`
        : `"${g.name}" and its history will be deleted. The ${formatMoney(g.saved, cur)} saved goes back to your balance.`,
      "Delete goal",
    );
    if (!ok) return;
    try {
      await api(`/api/savings/${g.id}`, { method: "DELETE" });
      refreshMoney();
      nav.goBack();
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function removeEntry(e: SavingsEntry) {
    if (!g || g.completed_on) return;
    const ok = await confirm(
      "Delete this entry?",
      `${formatMoney(e.amount, cur)} on ${format(parseDateOnly(e.date), "d MMM yyyy")}${e.transaction_id ? ", and its record in Money" : ""}.`,
      "Delete entry",
    );
    if (!ok) return;
    try {
      q.mutate(await api<SavingsGoalDetail>(`/api/savings/${g.id}/entries/${e.id}`, { method: "DELETE" }));
      refreshMoney();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen title={g?.name ?? "Savings"} subtitle="Savings goal" back={() => nav.goBack()} refreshing={q.refreshing} onRefresh={q.refresh}>
        {q.error && !g ? <ErrorBox error={q.error} onRetry={q.refresh} /> : null}
        {!g && q.loading ? <Loading /> : null}
        {g ? (
          <>
            {done ? (
              <View style={{ backgroundColor: c.foreground, borderRadius: 26, padding: 20 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Glyph name="seal-check" size={14} weight="fill" color={c.background} />
                  <Text style={{ color: c.background, opacity: 0.75, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
                    COMPLETED · {format(parseDateOnly(g.completed_on!), "d MMM yyyy").toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: c.background, opacity: 0.6, fontSize: 13, marginTop: 10 }}>Spent on {g.name}</Text>
                <Text style={{ color: c.background, fontSize: 40, fontWeight: "800", letterSpacing: -1.4, marginTop: 2, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMoney(g.spent ?? 0, cur)}
                </Text>
                <View style={{ flexDirection: "row", marginTop: 16 }}>
                  <HeroStat label="Had saved" value={formatMoney((g.spent ?? 0) + (g.leftover ?? 0), cur, true)} />
                  {(g.leftover ?? 0) >= 0 ? (
                    <HeroStat label="Back to balance" value={formatMoney(g.leftover ?? 0, cur, true)} last />
                  ) : (
                    <HeroStat label="Paid extra" value={formatMoney(-(g.leftover ?? 0), cur, true)} last />
                  )}
                </View>
              </View>
            ) : (
            <View style={{ backgroundColor: c.foreground, borderRadius: 26, padding: 20 }}>
              <Text style={{ color: c.background, opacity: 0.6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
                {g.reached ? "GOAL REACHED" : "SAVED SO FAR"}
              </Text>
              <Text style={{ color: c.background, fontSize: 40, fontWeight: "800", letterSpacing: -1.4, marginTop: 6, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoney(g.saved, cur)}
              </Text>
              {g.target ? (
                <>
                  <View style={{ marginTop: 16 }}>
                    <ProgressBar value={g.progress ?? 0} onDark />
                  </View>
                  <View style={{ flexDirection: "row", marginTop: 16 }}>
                    <HeroStat label="Target" value={formatMoney(g.target, cur, true)} />
                    <HeroStat label="Still to save" value={formatMoney(g.remaining ?? 0, cur, true)} />
                    <HeroStat label="This month" value={formatMoney(g.this_month, cur, true)} last />
                  </View>
                </>
              ) : (
                <Text style={{ color: c.background, opacity: 0.6, fontSize: 13, marginTop: 6 }}>
                  {formatMoney(g.this_month, cur)} this month · no target set
                </Text>
              )}
            </View>
            )}

            {done ? (
              <Button title="Reopen goal" variant="outline" onPress={reopen} />
            ) : (
              <>
                <Button title="Add savings" icon="plus" onPress={() => setEntry("deposit")} />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button title="Take out" variant="outline" style={{ flex: 1 }} onPress={() => setEntry("withdraw")} disabled={g.saved <= 0} />
                  <Button title="Edit goal" variant="outline" icon="edit-2" style={{ flex: 1 }} onPress={() => setEditing(true)} />
                </View>
                <Button title="Complete goal" variant="outline" icon="check" onPress={() => setCompleting(true)} />
              </>
            )}
            {g.note ? <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>{g.note}</Text> : null}

            <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "800", letterSpacing: -0.4, marginTop: 8 }}>History</Text>
            {g.entries.length === 0 ? (
              <Text style={{ color: c.mutedForeground, fontSize: 14 }}>Nothing saved yet. Tap "Add savings" to put money aside.</Text>
            ) : (
              <>
                <View style={{ backgroundColor: c.card, borderRadius: 22, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
                  {g.entries.map((e, i) => (
                    <Pressable
                      key={e.id}
                      onLongPress={() => removeEntry(e)}
                      delayLongPress={350}
                      style={({ pressed }) => [
                        { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
                        i > 0 && { borderTopWidth: 1, borderTopColor: c.border },
                        pressed && { backgroundColor: c.muted },
                      ]}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 12,
                          backgroundColor: e.kind === "deposit" ? c.foreground : c.muted,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Glyph name={e.kind === "deposit" ? "piggy" : "arrow-in"} size={19} weight="bold" color={e.kind === "deposit" ? c.background : c.foreground} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>{e.kind === "deposit" ? "Saved" : "Took out"}</Text>
                        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                          {format(parseDateOnly(e.date), "d MMM yyyy")}
                          {e.note ? ` · ${e.note}` : ""}
                          {e.transaction_id ? "" : " · not in Money"}
                        </Text>
                      </View>
                      <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                        {e.kind === "deposit" ? "+" : "−"}
                        {formatMoney(e.amount, cur)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {done ? null : <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Press and hold an entry to delete it.</Text>}
              </>
            )}

            <Pressable onPress={removeGoal} hitSlop={8} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
              <Glyph name="trash" size={16} color={c.danger} weight="bold" />
              <Text style={{ color: c.danger, fontSize: 14, fontWeight: "700" }}>Delete goal</Text>
            </Pressable>
          </>
        ) : null}
      </Screen>

      {g ? (
        <>
          <EntryForm visible={!!entry} kind={entry ?? "deposit"} goal={g} onClose={() => setEntry(null)} onSaved={(d) => q.mutate(d)} />
          <GoalForm visible={editing} goal={g} onClose={() => setEditing(false)} onSaved={(d) => q.mutate(d)} />
          <CompleteForm visible={completing} goal={g} onClose={() => setCompleting(false)} onSaved={(d) => q.mutate(d)} />
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

// ================================================================ forms

function GoalForm({
  visible,
  goal,
  onClose,
  onSaved,
}: {
  visible: boolean;
  goal?: SavingsGoalDetail;
  onClose: () => void;
  onSaved: (g: SavingsGoalDetail) => void;
}) {
  const cur = useUser().currency;
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [note, setNote] = React.useState("");
  const { saving, errors, setErrors, run } = useSubmit();

  React.useEffect(() => {
    if (!visible) return;
    setName(goal?.name ?? "");
    setTarget(goal?.target ? String(goal.target) : "");
    setNote(goal?.note ?? "");
    setErrors({});
  }, [visible, goal, setErrors]);

  const save = () =>
    run(async () => {
      if (!name.trim()) return setErrors({ name: "What are you saving for?" });
      const t = target.trim() ? parseAmount(target) : null;
      if (t !== null && !(t > 0)) return setErrors({ target: "Enter an amount, or leave it empty" });
      const json = { name: name.trim(), target: t, note: note.trim() || null };
      const res = goal
        ? await api<SavingsGoalDetail>(`/api/savings/${goal.id}`, { method: "PATCH", json })
        : await api<SavingsGoalDetail>("/api/savings", { method: "POST", json });
      invalidate("/api/savings");
      toast(goal ? "Goal updated" : `Goal "${res.name}" created`);
      onClose();
      onSaved(res);
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={goal ? "Edit goal" : "New savings goal"} footer={<Button title={goal ? "Save changes" : "Create goal"} onPress={save} loading={saving} />}>
      <Input label="Saving for" value={name} onChangeText={setName} placeholder="e.g. New laptop, Hajj, Emergency fund" error={errors.name} autoFocus={!goal} />
      <Input
        label={`Approximate target (${cur})`}
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        placeholder="Optional, e.g. 120000"
        error={errors.target}
      />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="Optional" multiline />
    </Sheet>
  );
}

function EntryForm({
  visible,
  kind,
  goal,
  onClose,
  onSaved,
}: {
  visible: boolean;
  kind: "deposit" | "withdraw";
  goal: SavingsGoal;
  onClose: () => void;
  onSaved?: (g: SavingsGoalDetail) => void;
}) {
  const c = useColors();
  const dark = useIsDark();
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

  const deposit = kind === "deposit";
  const save = () =>
    run(async () => {
      const value = parseAmount(amount);
      if (!(value > 0)) return setErrors({ amount: "Enter an amount" });
      if (!deposit && value > goal.saved + 0.005) return setErrors({ amount: `Only ${formatMoney(goal.saved, cur)} is saved` });
      const res = await api<SavingsGoalDetail>(`/api/savings/${goal.id}/entries`, {
        method: "POST",
        json: { kind, amount: value, date: toISODate(date), note: note.trim() || null, record_in_money: record, payment_method: method },
      });
      refreshMoney();
      onSaved?.(res);
      toast(
        deposit
          ? res.reached && res.target
            ? `Goal reached: ${formatMoney(res.saved, cur)} saved for ${res.name}!`
            : `Saved ${formatMoney(value, cur)} for ${res.name}`
          : `Took ${formatMoney(value, cur)} out of ${res.name}`,
      );
      onClose();
    });

  const quick = deposit && goal.remaining ? [goal.remaining] : [];

  return (
    <Sheet visible={visible} onClose={onClose} title={deposit ? `Save for ${goal.name}` : `Take out of ${goal.name}`} footer={<Button title={deposit ? "Save" : "Take out"} onPress={save} loading={saving} />}>
      <Input label={`Amount (${cur})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} autoFocus />
      {quick.length || !deposit ? (
        <Pressable
          onPress={() => setAmount(String(deposit ? quick[0] : goal.saved))}
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
          <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "700" }}>
            {deposit ? `Rest of target · ${formatMoney(quick[0], cur)}` : `All of it · ${formatMoney(goal.saved, cur)}`}
          </Text>
        </Pressable>
      ) : null}
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="Optional, e.g. November savings" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }}>{deposit ? "Take it off my balance" : "Add it back to my balance"}</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>
            {deposit ? "Counts as an expense this month, so your balance shows what's left to spend." : "Counts as income this month."}
          </Text>
        </View>
        <Switch value={record} onValueChange={setRecord} trackColor={{ false: c.input, true: c.foreground }} thumbColor={dark ? (record ? "#0A0A0A" : "#A3A3A3") : "#FFFFFF"} />
      </View>
      {record ? (
        <Field label={deposit ? "Paid from" : "Comes back as"}>
          <Chips options={PAYMENT_METHODS} value={method} onChange={setMethod} />
        </Field>
      ) : null}
    </Sheet>
  );
}

/** Finish a goal: enter what was actually spent. Left-over money goes back to the balance. */
function CompleteForm({
  visible,
  goal,
  onClose,
  onSaved,
}: {
  visible: boolean;
  goal: SavingsGoalDetail;
  onClose: () => void;
  onSaved: (g: SavingsGoalDetail) => void;
}) {
  const c = useColors();
  const dark = useIsDark();
  const cur = useUser().currency;
  const [spent, setSpent] = React.useState("");
  const [date, setDate] = React.useState(new Date());
  const [record, setRecord] = React.useState(true);
  const { saving, errors, setErrors, run } = useSubmit();
  const saved = Math.max(0, goal.saved);

  React.useEffect(() => {
    if (!visible) return;
    setSpent("");
    setDate(new Date());
    setRecord(true);
    setErrors({});
  }, [visible, setErrors]);

  const value = parseAmount(spent);
  const diff = Number.isFinite(value) && spent.trim() ? Math.round((saved - value) * 100) / 100 : null;

  const save = () =>
    run(async () => {
      if (!spent.trim() || !(value >= 0)) return setErrors({ spent: "Enter how much you spent" });
      const res = await api<SavingsGoalDetail>(`/api/savings/${goal.id}/complete`, {
        method: "POST",
        json: { spent: value, date: toISODate(date), record_in_money: record },
      });
      refreshMoney();
      onSaved(res);
      const back = res.leftover ?? 0;
      toast(back > 0 ? `${res.name} completed · ${formatMoney(back, cur)} back in your balance` : `${res.name} completed`);
      onClose();
    });

  return (
    <Sheet visible={visible} onClose={onClose} title={`Complete ${goal.name}`} footer={<Button title="Complete goal" onPress={save} loading={saving} />}>
      <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>
        You saved {formatMoney(saved, cur)}. How much did you actually spend on it?
      </Text>
      <Input label={`Amount spent (${cur})`} value={spent} onChangeText={setSpent} keyboardType="decimal-pad" placeholder="0" error={errors.spent} autoFocus />
      <Pressable
        onPress={() => setSpent(String(saved))}
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
        <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "700" }}>Spent all of it · {formatMoney(saved, cur)}</Text>
      </Pressable>
      {diff !== null ? (
        <View style={{ padding: 14, borderRadius: 16, backgroundColor: c.muted }}>
          <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }}>
            {diff > 0.005
              ? `${formatMoney(diff, cur)} left over goes back to your balance`
              : diff < -0.005
                ? `${formatMoney(-diff, cur)} more than you saved is added as an expense`
                : "You spent exactly what you saved"}
          </Text>
        </View>
      ) : null}
      <DateField label="Date" value={date} onChange={(d) => d && setDate(d)} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }}>Update my balance</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>Record the left-over (or extra) amount in Money.</Text>
        </View>
        <Switch value={record} onValueChange={setRecord} trackColor={{ false: c.input, true: c.foreground }} thumbColor={dark ? (record ? "#0A0A0A" : "#A3A3A3") : "#FFFFFF"} />
      </View>
    </Sheet>
  );
}
