import { useNavigation } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { format } from "date-fns/format";
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";

import { useUser } from "../auth";
import { useQuery } from "../query";
import { useColors } from "../theme";
import { downloadReportPdf } from "../reportPdf";
import { Button, ErrorBox, Icon, IconButton, Loading, Progress, Screen, errorMessage, toast } from "../ui";
import { formatMoney, monthKey, monthLabel, parseDateOnly } from "../utils";

/* One-page monthly report: money in and out, daily average, loans and savings.
   Opened from the Money tab; when a new month starts the Money tab offers last month's report. */

export type MonthlyReportParams = { month?: string };

export interface MonthlyReport {
  month: string;
  start: string;
  end: string;
  partial: boolean;
  days: number;
  has_data: boolean;
  income: number;
  expense: number;
  balance: number;
  avg_daily_expense: number;
  transactions: number;
  previous: { month: string; income: number; expense: number; income_change: number | null; expense_change: number | null };
  top_categories: { name: string; color: string; total: number; percent: number }[];
  biggest_expense: { amount: number; description: string; date: string } | null;
  top_spending_day: { date: string; amount: number } | null;
  income_for_other_months: number;
  received_later: number;
  loans: {
    owed_to_me: number;
    i_owe: number;
    owed_to_me_people: { id: number; person: string; amount: number }[];
    i_owe_people: { id: number; person: string; amount: number }[];
    lent_this_month: number;
    borrowed_this_month: number;
    repaid_to_me_this_month: number;
    repaid_by_me_this_month: number;
  };
  savings: {
    put_aside: number;
    taken_out: number;
    net: number;
    completed: { id: number; name: string; spent: number; leftover: number; target: number | null; completed_on: string }[];
    in_progress: { id: number; name: string; saved: number; target: number | null; progress: number | null }[];
  };
}

// ---------------------------------------------------------------- "report ready" reminder

const SEEN_KEY = "dayora_report_seen";

/** Last month's key, while its report hasn't been opened or dismissed yet; else null. */
export function useReportReady(): [string | null, () => void] {
  const last = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const [seen, setSeen] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    SecureStore.getItemAsync(SEEN_KEY)
      .then((v) => setSeen(v))
      .catch(() => setSeen(null));
  }, []);
  const dismiss = React.useCallback(() => {
    setSeen(last);
    SecureStore.setItemAsync(SEEN_KEY, last).catch(() => {});
  }, [last]);
  return [seen === undefined || seen === last ? null : last, dismiss];
}

// ---------------------------------------------------------------- screen

function shift(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + by, 1));
}

export function MonthlyReportScreen({ route }: NativeStackScreenProps<{ MonthlyReport: MonthlyReportParams }, "MonthlyReport">) {
  const c = useColors();
  const nav = useNavigation<any>();
  const user = useUser();
  const cur = user.currency;
  const [downloading, setDownloading] = React.useState(false);
  const thisMonth = monthKey(new Date());
  const [month, setMonth] = React.useState(route.params?.month ?? shift(thisMonth, -1));
  const q = useQuery<MonthlyReport>(`/api/reports/monthly?month=${month}`);
  const r = q.data && q.data.month === month ? q.data : null;
  const [y, m] = month.split("-").map(Number);
  const title = format(new Date(y, m - 1, 1), "MMMM yyyy");
  const money = (v: number) => formatMoney(v, cur);

  // Opening last month's report counts as seeing it.
  React.useEffect(() => {
    if (month === shift(thisMonth, -1)) SecureStore.setItemAsync(SEEN_KEY, month).catch(() => {});
  }, [month, thisMonth]);

  async function download() {
    if (!r || downloading) return;
    setDownloading(true);
    try {
      const saved = await downloadReportPdf(r, cur, user.name);
      if (saved) toast(`Saved "${saved}"`);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Screen
      title={title}
      subtitle={r?.partial ? `Monthly report · so far (${r.days} days)` : "Monthly report"}
      back={() => nav.goBack()}
      right={r ? <IconButton name="download" label="Download report" onPress={download} /> : null}
      refreshing={q.refreshing}
      onRefresh={q.refresh}
    >
      {/* month switcher */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton name="chevron-left" label="Previous month" onPress={() => setMonth(shift(month, -1))} />
        <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>{title}</Text>
        {month < thisMonth ? (
          <IconButton name="chevron-right" label="Next month" onPress={() => setMonth(shift(month, 1))} />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {q.error && !r ? <ErrorBox error={q.error} onRetry={q.refresh} /> : null}
      {!r && !q.error ? <Loading /> : null}

      {r ? (
        <>
          {/* balance hero */}
          <View style={{ backgroundColor: c.foreground, borderRadius: 26, padding: 20 }}>
            <Text style={{ color: c.background, opacity: 0.6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
              {r.partial ? "BALANCE SO FAR" : "BALANCE FOR THE MONTH"}
            </Text>
            <Text
              style={{ color: c.background, fontSize: 40, fontWeight: "800", letterSpacing: -1.4, marginTop: 6, fontVariant: ["tabular-nums"] }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {r.balance < 0 ? "−" : ""}
              {money(Math.abs(r.balance))}
            </Text>
            <Text style={{ color: c.background, opacity: 0.65, fontSize: 13, marginTop: 4 }}>
              {r.balance >= 0 ? "Left over after expenses" : "Spent more than came in"} · {r.transactions} transactions
            </Text>
          </View>

          {!r.has_data ? (
            <Text style={{ color: c.mutedForeground, fontSize: 14, textAlign: "center", marginVertical: 12 }}>Nothing recorded for {title}.</Text>
          ) : null}

          {/* key numbers */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="Total income" value={money(r.income)} change={r.previous.income_change} good="up" prev={monthLabel(r.previous.month)} />
            <Stat label="Total expense" value={money(r.expense)} change={r.previous.expense_change} good="down" prev={monthLabel(r.previous.month)} />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat label="Avg daily expense" value={money(r.avg_daily_expense)} hint={`over ${r.days} days`} />
            <Stat
              label="Most spent in a day"
              value={r.top_spending_day ? money(r.top_spending_day.amount) : "—"}
              hint={r.top_spending_day ? format(parseDateOnly(r.top_spending_day.date), "EEE d MMM") : "no expenses"}
            />
          </View>
          {r.income_for_other_months > 0 || r.received_later > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 4 }}>
              <Icon name="info" size={14} color={c.mutedForeground} style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, color: c.mutedForeground, fontSize: 12, lineHeight: 17 }}>
                {r.income_for_other_months > 0 ? `Income includes ${money(r.income_for_other_months)} that was for another month. ` : ""}
                {r.received_later > 0 ? `${money(r.received_later)} for ${monthLabel(month)} was received in another month (not counted here).` : ""}
              </Text>
            </View>
          ) : null}

          {/* spending */}
          <Section title="Where the money went" icon="pie-chart">
            {r.top_categories.length === 0 ? (
              <Muted>No expenses this month.</Muted>
            ) : (
              r.top_categories.map((cat) => (
                <View key={cat.name} style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600" }}>{cat.name}</Text>
                    <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {money(cat.total)} <Text style={{ color: c.mutedForeground, fontWeight: "500" }}>· {Math.round(cat.percent)}%</Text>
                    </Text>
                  </View>
                  <Progress value={cat.percent} color={cat.color} height={6} />
                </View>
              ))
            )}
            {r.biggest_expense ? (
              <Muted>
                Biggest expense: {r.biggest_expense.description}, {money(r.biggest_expense.amount)} on{" "}
                {format(parseDateOnly(r.biggest_expense.date), "d MMM")}
              </Muted>
            ) : null}
          </Section>

          {/* loans */}
          <Section title={r.partial ? "Loans today" : "Loans at month end"} icon="users">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pill label="Owed to me" value={money(r.loans.owed_to_me)} />
              <Pill label="I owe" value={money(r.loans.i_owe)} />
            </View>
            <People title="Owed to me" rows={r.loans.owed_to_me_people} money={money} />
            <People title="I owe" rows={r.loans.i_owe_people} money={money} />
            {r.loans.lent_this_month || r.loans.borrowed_this_month || r.loans.repaid_to_me_this_month || r.loans.repaid_by_me_this_month ? (
              <Muted>
                {[
                  r.loans.lent_this_month ? `Lent ${money(r.loans.lent_this_month)}` : "",
                  r.loans.repaid_to_me_this_month ? `got back ${money(r.loans.repaid_to_me_this_month)}` : "",
                  r.loans.borrowed_this_month ? `borrowed ${money(r.loans.borrowed_this_month)}` : "",
                  r.loans.repaid_by_me_this_month ? `repaid ${money(r.loans.repaid_by_me_this_month)}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")
                  .replace(/^./, (x) => x.toUpperCase())}{" "}
                this month
              </Muted>
            ) : !r.loans.owed_to_me && !r.loans.i_owe ? (
              <Muted>No open loans.</Muted>
            ) : null}
          </Section>

          {/* savings */}
          <Section title="Savings" icon="target">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pill label="Put aside" value={money(r.savings.put_aside)} />
              <Pill label="Taken out" value={money(r.savings.taken_out)} />
            </View>
            {r.savings.completed.length ? (
              <View style={{ gap: 8 }}>
                <Label>Completed this month</Label>
                {r.savings.completed.map((g) => (
                  <Pressable key={g.id} onPress={() => nav.navigate("SavingsGoal", { id: g.id })} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Icon name="check-circle" size={18} color={c.foreground} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>{g.name}</Text>
                      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                        Spent {money(g.spent)}
                        {g.leftover > 0 ? ` · ${money(g.leftover)} back to balance` : g.leftover < 0 ? ` · ${money(-g.leftover)} over savings` : ""}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {r.savings.in_progress.length ? (
              <View style={{ gap: 10 }}>
                <Label>In progress</Label>
                {r.savings.in_progress.map((g) => (
                  <Pressable key={g.id} onPress={() => nav.navigate("SavingsGoal", { id: g.id })} style={{ gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "600", flex: 1 }} numberOfLines={1}>{g.name}</Text>
                      <Text style={{ color: c.mutedForeground, fontSize: 13, fontVariant: ["tabular-nums"] }}>
                        {money(g.saved)}
                        {g.target ? ` of ${money(g.target)}` : ""}
                      </Text>
                    </View>
                    {g.progress !== null ? <Progress value={g.progress} color={c.foreground} height={6} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {!r.savings.completed.length && !r.savings.in_progress.length && !r.savings.put_aside ? <Muted>No savings goals this month.</Muted> : null}
          </Section>

          <Button title="Download report (PDF)" icon="download" onPress={download} loading={downloading} />
        </>
      ) : null}
    </Screen>
  );
}

// ---------------------------------------------------------------- pieces

function Stat({ label, value, hint, change, good, prev }: { label: string; value: string; hint?: string; change?: number | null; good?: "up" | "down"; prev?: string }) {
  const c = useColors();
  let note = hint;
  let color = c.mutedForeground;
  if (change !== undefined) {
    if (change === null) note = `no data for ${prev}`;
    else {
      note = `${change > 0 ? "▲" : change < 0 ? "▼" : ""} ${Math.abs(Math.round(change))}% vs ${prev}`;
      const better = good === "up" ? change > 0 : change < 0;
      color = change === 0 ? c.mutedForeground : better ? c.success : c.danger;
    }
  }
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 18, backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 19, fontWeight: "800", marginTop: 8, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text style={{ color, fontSize: 11, marginTop: 3, fontWeight: "600" }} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ComponentProps<typeof Icon>["name"]; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={17} color={c.foreground} />
        <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "800" }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: c.muted }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 17, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function People({ title, rows, money }: { title: string; rows: { id: number; person: string; amount: number }[]; money: (v: number) => string }) {
  const c = useColors();
  const nav = useNavigation<any>();
  if (!rows.length) return null;
  return (
    <View style={{ gap: 8 }}>
      <Label>{title}</Label>
      {rows.map((p) => (
        <Pressable key={p.id} onPress={() => nav.navigate("Loan", { id: p.id })} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: c.foreground, fontSize: 14 }} numberOfLines={1}>{p.person}</Text>
          <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{money(p.amount)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{String(children).toUpperCase()}</Text>;
}

function Muted({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 18 }}>{children}</Text>;
}
