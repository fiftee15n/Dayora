import { useNavigation } from "@react-navigation/native";
import { format } from "date-fns/format";
import * as React from "react";
import { View } from "react-native";

import { qs } from "../api";
import { useUser } from "../auth";
import { BarChart } from "../charts";
import { useQuery } from "../query";
import { useColors } from "../theme";
import type { Activity, Page, Report } from "../types";
import { Button, Card, CardHeader, Chips, ErrorBox, type IconName, IconButton, IconTile, Loading, Row, Screen, Segmented, Stat, T } from "../ui";
import { formatMoney, parseDateOnly, timeAgo } from "../utils";

const ENTITIES = [
  { value: "all", label: "Everything" },
  { value: "task", label: "Tasks" },
  { value: "transaction", label: "Money" },
  { value: "habit", label: "Habits" },
  { value: "reminder", label: "Reminders" },
  { value: "note", label: "Notes" },
  { value: "account", label: "Account" },
];

const ICONS: Record<string, IconName> = {
  task: "check-square",
  transaction: "credit-card",
  budget: "pie-chart",
  habit: "target",
  reminder: "bell",
  note: "edit-3",
  account: "user",
};

export function HistoryScreen() {
  const c = useColors();
  const user = useUser();
  const nav = useNavigation<any>();
  const [period, setPeriod] = React.useState<"week" | "month">("week");
  const [offset, setOffset] = React.useState(0);
  const [entity, setEntity] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<Activity[]>([]);

  const report = useQuery<Report>(`/api/reports${qs({ period, offset })}`);
  const activity = useQuery<Page<Activity>>(`/api/activity${qs({ entity_type: entity, page, page_size: 25 })}`);

  React.useEffect(() => setPage(1), [entity]);
  React.useEffect(() => {
    const d = activity.data;
    if (!d) return;
    setItems((prev) => (d.page === 1 ? d.items : [...prev.filter((p) => !d.items.some((n) => n.id === p.id)), ...d.items]));
  }, [activity.data]);

  const r = report.data;
  const colorFor: Record<string, string> = { task: c.primary, transaction: c.danger, budget: c.warning, habit: c.success, reminder: c.accent, note: c.warning, account: c.mutedForeground };

  return (
    <Screen
      title="History"
      subtitle="Reports and everything you've done"
      back={() => nav.goBack()}
      refreshing={report.refreshing}
      onRefresh={() => {
        report.refresh();
        setPage(1);
        activity.refresh();
      }}
    >
      <Segmented
        options={[
          { value: "week", label: "Weekly" },
          { value: "month", label: "Monthly" },
        ]}
        value={period}
        onChange={(p) => {
          setPeriod(p);
          setOffset(0);
        }}
      />
      <Card style={{ paddingVertical: 10 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <IconButton name="chevron-left" onPress={() => setOffset(Math.min(60, offset + 1))} label="Previous period" />
          <View style={{ alignItems: "center" }}>
            <T variant="h3">
              {r ? (period === "week" ? `${format(parseDateOnly(r.start), "MMM d")} – ${format(parseDateOnly(r.end), "MMM d")}` : format(parseDateOnly(r.start), "MMMM yyyy")) : "…"}
            </T>
            <T variant="caption" muted>{offset === 0 ? `This ${period}` : offset === 1 ? `Last ${period}` : `${offset} ${period}s ago`}</T>
          </View>
          <IconButton name="chevron-right" onPress={() => setOffset(Math.max(0, offset - 1))} label="Next period" />
        </Row>
      </Card>

      {report.error && !r ? <ErrorBox error={report.error} onRetry={report.refresh} /> : null}
      {report.loading ? <Loading /> : null}
      {r ? (
        <>
          <Row gap={10}>
            <Stat label="Tasks completed" value={String(r.tasks_completed)} icon="check-circle" color={c.primary} sub={`${r.tasks_created} created`} />
            <Stat label="Habit rate" value={`${Math.round(r.habit_rate)}%`} icon="target" color={c.success} sub={`${r.habit_checkins} check-ins`} />
          </Row>
          <Row gap={10}>
            <Stat label="Spent" value={formatMoney(r.expense, user.currency, true)} icon="arrow-up-right" color={c.danger} sub={`Income ${formatMoney(r.income, user.currency, true)}`} />
            <Stat label="Reminders done" value={String(r.reminders_completed)} icon="bell" color={c.accent} sub={r.most_productive_day ? `Best day ${format(parseDateOnly(r.most_productive_day), "EEE d")}` : undefined} />
          </Row>
          <Card style={{ gap: 14 }}>
            <CardHeader title="Daily activity" />
            <BarChart
              labels={r.series.map((d) => format(parseDateOnly(d.date), period === "week" ? "EEE" : "d"))}
              series={[
                { name: "Tasks", color: c.primary, values: r.series.map((d) => d.tasks_completed) },
                { name: "Habits", color: c.success, values: r.series.map((d) => d.habit_checkins) },
              ]}
              height={110}
            />
          </Card>
          {r.top_categories.length ? (
            <Card style={{ gap: 10 }}>
              <CardHeader title="Top spending" />
              {r.top_categories.map((t) => (
                <Row key={t.name} gap={8}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.color }} />
                  <T style={{ flex: 1 }}>{t.name}</T>
                  <T weight="700">{formatMoney(t.total, user.currency)}</T>
                </Row>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <CardHeader title="Activity log" />
      <Chips options={ENTITIES} value={entity} onChange={setEntity} />
      {activity.error && !activity.data ? <ErrorBox error={activity.error} onRetry={activity.refresh} /> : null}
      <Card style={{ gap: 14 }}>
        {activity.data && items.length === 0 ? <T variant="small" muted>No activity yet.</T> : null}
        {items.map((a) => (
          <Row key={a.id} gap={12}>
            <IconTile name={ICONS[a.entity_type] ?? "activity"} color={colorFor[a.entity_type] ?? c.primary} size={34} />
            <View style={{ flex: 1 }}>
              <T variant="small" numberOfLines={2}>{a.description}</T>
              <T variant="caption" muted>{timeAgo(a.created_at)} · {format(new Date(a.created_at), "MMM d, h:mm a")}</T>
            </View>
          </Row>
        ))}
      </Card>
      {activity.data && items.length < activity.data.total ? (
        <Button title="Load more" variant="outline" onPress={() => setPage(page + 1)} loading={activity.loading} />
      ) : null}
    </Screen>
  );
}
