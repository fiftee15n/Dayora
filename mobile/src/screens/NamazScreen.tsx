import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { addDays } from "date-fns/addDays";
import { differenceInMinutes } from "date-fns/differenceInMinutes";
import { format } from "date-fns/format";
import { isSameDay } from "date-fns/isSameDay";
import { startOfDay } from "date-fns/startOfDay";
import * as SecureStore from "expo-secure-store";
import * as React from "react";
import { Pressable, Text, View } from "react-native";

import { api, qs } from "../api";
import { Glyph } from "../icons";
import { invalidate, useQuery } from "../query";
import { useColors } from "../theme";
import { Screen, Sheet, errorMessage, toast } from "../ui";
import { toISODate } from "../utils";

/* Namaz — the five daily prayers. Times are calculated on the phone (adhan library,
   University of Islamic Sciences Karachi method with Hanafi Asr, as used in Bangladesh), so no
   internet or location permission is needed: the user picks their city once. */

type PrayerKey = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
type Status = "prayed" | "qaza";
type Log = { date: string; prayer: PrayerKey; status: Status };
type Stats = {
  today: string;
  today_done: number;
  streak: number;
  best_streak: number;
  month_done: number;
  month_possible: number;
  month_on_time: number;
  month_qaza: number;
};

const PRAYERS: { key: PrayerKey; name: string; bn: string }[] = [
  { key: "fajr", name: "Fajr", bn: "ফজর" },
  { key: "dhuhr", name: "Dhuhr", bn: "যোহর" },
  { key: "asr", name: "Asr", bn: "আসর" },
  { key: "maghrib", name: "Maghrib", bn: "মাগরিব" },
  { key: "isha", name: "Isha", bn: "এশা" },
];

export const CITIES = [
  { key: "dhaka", name: "Dhaka", lat: 23.8103, lng: 90.4125 },
  { key: "chattogram", name: "Chattogram", lat: 22.3569, lng: 91.7832 },
  { key: "sylhet", name: "Sylhet", lat: 24.8949, lng: 91.8687 },
  { key: "khulna", name: "Khulna", lat: 22.8456, lng: 89.5403 },
  { key: "rajshahi", name: "Rajshahi", lat: 24.3745, lng: 88.6042 },
  { key: "barishal", name: "Barishal", lat: 22.701, lng: 90.3535 },
  { key: "rangpur", name: "Rangpur", lat: 25.7439, lng: 89.2752 },
  { key: "mymensingh", name: "Mymensingh", lat: 24.7471, lng: 90.4203 },
  { key: "cumilla", name: "Cumilla", lat: 23.4607, lng: 91.1809 },
  { key: "gazipur", name: "Gazipur", lat: 23.9999, lng: 90.4203 },
  { key: "narayanganj", name: "Narayanganj", lat: 23.6238, lng: 90.5 },
  { key: "coxsbazar", name: "Cox's Bazar", lat: 21.4272, lng: 92.0058 },
] as const;
type CityKey = (typeof CITIES)[number]["key"];
const CITY_KEY = "dayora_prayer_city";

function usePrayerCity() {
  const [city, setCity] = React.useState<CityKey>("dhaka");
  React.useEffect(() => {
    SecureStore.getItemAsync(CITY_KEY)
      .then((v) => v && CITIES.some((c) => c.key === v) && setCity(v as CityKey))
      .catch(() => {});
  }, []);
  const choose = (k: CityKey) => {
    setCity(k);
    SecureStore.setItemAsync(CITY_KEY, k).catch(() => {});
  };
  return [CITIES.find((c) => c.key === city)!, choose] as const;
}

function timesFor(day: Date, lat: number, lng: number) {
  const params = CalculationMethod.Karachi();
  params.madhab = Madhab.Hanafi;
  return new PrayerTimes(new Coordinates(lat, lng), day, params);
}

function useNow(everyMs = 30_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

function inText(mins: number) {
  if (mins < 1) return "now";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

export function NamazScreen() {
  const c = useColors();
  const now = useNow();
  const today = startOfDay(now);
  const [selected, setSelected] = React.useState(today);
  const [city, setCity] = usePrayerCity();
  const [cityOpen, setCityOpen] = React.useState(false);
  const [statusFor, setStatusFor] = React.useState<PrayerKey | null>(null);

  const weekStart = addDays(today, -6);
  const logsPath = `/api/prayers${qs({ start: toISODate(weekStart), end: toISODate(today) })}`;
  const logs = useQuery<Log[]>(logsPath);
  const stats = useQuery<Stats>("/api/prayers/stats");

  const selKey = toISODate(selected);
  const marks = new Map((logs.data ?? []).filter((l) => l.date === selKey).map((l) => [l.prayer, l.status]));
  const isToday = isSameDay(selected, today);
  const times = timesFor(selected, city.lat, city.lng);

  // Next prayer (today, or tomorrow's Fajr after Isha).
  const todayTimes = timesFor(today, city.lat, city.lng);
  let next = PRAYERS.find((p) => (todayTimes[p.key] as Date) > now);
  let nextAt = next ? (todayTimes[next.key] as Date) : timesFor(addDays(today, 1), city.lat, city.lng).fajr;
  if (!next) next = PRAYERS[0];
  const current = [...PRAYERS].reverse().find((p) => (todayTimes[p.key] as Date) <= now);

  async function setMark(p: PrayerKey, status: Status | null) {
    // Optimistic: update the list straight away.
    if (logs.data) {
      const rest = logs.data.filter((l) => !(l.date === selKey && l.prayer === p));
      logs.mutate(status ? [...rest, { date: selKey, prayer: p, status }] : rest);
    }
    try {
      if (status) await api(`/api/prayers/${selKey}/${p}`, { method: "PUT", json: { status } });
      else await api(`/api/prayers/${selKey}/${p}`, { method: "DELETE" });
    } catch (e) {
      toast(errorMessage(e));
      logs.refresh();
    }
    invalidate("/api/prayers/stats");
  }

  function tap(p: PrayerKey, notYet: boolean) {
    if (notYet) return toast(`${PRAYERS.find((x) => x.key === p)!.name} time hasn't started yet`);
    setMark(p, marks.has(p) ? null : "prayed");
  }

  const doneCount = marks.size;
  const s = stats.data;

  return (
    <Screen
      title="Namaz"
      subtitle="Five daily prayers"
      refreshing={logs.refreshing}
      onRefresh={() => {
        logs.refresh();
        stats.refresh();
      }}
    >
      {/* ---- last 7 days */}
      <View style={{ flexDirection: "row", gap: 6 }}>
        {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
          const key = toISODate(d);
          const n = (logs.data ?? []).filter((l) => l.date === key).length;
          const sel = isSameDay(d, selected);
          return (
            <Pressable
              key={key}
              onPress={() => setSelected(d)}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                paddingVertical: 10,
                borderRadius: 16,
                gap: 4,
                backgroundColor: sel ? c.foreground : pressed ? c.muted : c.card,
                borderWidth: sel ? 0 : 1,
                borderColor: c.border,
              })}
            >
              <Text style={{ color: sel ? c.background : c.mutedForeground, fontSize: 11, fontWeight: "700" }}>{format(d, "EEEEE")}</Text>
              <Text style={{ color: sel ? c.background : c.foreground, fontSize: 16, fontWeight: "800" }}>{format(d, "d")}</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                {PRAYERS.map((_, j) => (
                  <View
                    key={j}
                    style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: sel ? c.background : c.foreground, opacity: j < n ? 1 : 0.18 }}
                  />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* ---- hero */}
      <View style={{ backgroundColor: c.foreground, borderRadius: 26, padding: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: c.background, opacity: 0.6, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
            {isToday ? "NEXT PRAYER" : format(selected, "EEEE · d MMMM").toUpperCase()}
          </Text>
          <Pressable
            onPress={() => setCityOpen(true)}
            hitSlop={8}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: "rgba(127,127,127,0.22)" }}
          >
            <Glyph name="map-pin" size={13} weight="fill" color={c.background} />
            <Text style={{ color: c.background, fontSize: 12, fontWeight: "700" }}>{city.name}</Text>
          </Pressable>
        </View>

        {isToday ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 14 }}>
              <Text style={{ color: c.background, fontSize: 40, fontWeight: "800", letterSpacing: -1.2 }}>{next.name}</Text>
              <Text style={{ color: c.background, opacity: 0.6, fontSize: 18, fontWeight: "700" }}>{next.bn}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Text style={{ color: c.background, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{format(nextAt, "h:mm a")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: c.background }}>
                <Glyph name="countdown" size={13} weight="bold" color={c.foreground} />
                <Text style={{ color: c.foreground, fontSize: 12, fontWeight: "800" }}>{inText(differenceInMinutes(nextAt, now))}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={{ color: c.background, fontSize: 34, fontWeight: "800", letterSpacing: -1, marginTop: 14 }}>{doneCount} of 5 prayed</Text>
        )}

        <View style={{ flexDirection: "row", gap: 4, marginTop: 18 }}>
          {PRAYERS.map((p) => {
            const st = marks.get(p.key);
            return <View key={p.key} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.background, opacity: st === "prayed" ? 1 : st === "qaza" ? 0.55 : 0.18 }} />;
          })}
        </View>
        <Text style={{ color: c.background, opacity: 0.6, fontSize: 12, marginTop: 8 }}>
          {doneCount} of 5 {isToday ? "prayed today" : "marked"}
          {[...marks.values()].includes("qaza") ? ` · ${[...marks.values()].filter((v) => v === "qaza").length} qaza` : ""}
        </Text>
      </View>

      {/* ---- the five prayers */}
      <View style={{ backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
        {PRAYERS.map((p, i) => {
          const at = times[p.key] as Date;
          const st = marks.get(p.key);
          const notYet = isToday && at > now;
          const isNow = isToday && current?.key === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => tap(p.key, notYet)}
              onLongPress={() => !notYet && setStatusFor(p.key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!st, disabled: notYet }}
              accessibilityLabel={`${p.name}${st ? `, ${st === "qaza" ? "qaza" : "prayed"}` : ""}`}
              style={({ pressed }) => [
                { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 15 },
                i > 0 && { borderTopWidth: 1, borderTopColor: c.border },
                pressed && !notYet && { backgroundColor: c.muted },
              ]}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: st === "prayed" ? c.foreground : st === "qaza" ? c.muted : "transparent",
                  borderWidth: st ? (st === "qaza" ? 1.5 : 0) : 1.5,
                  borderColor: st === "qaza" ? c.foreground : c.input,
                  opacity: notYet ? 0.4 : 1,
                }}
              >
                {st === "prayed" ? <Glyph name="check" size={15} weight="bold" color={c.background} /> : null}
                {st === "qaza" ? <Glyph name="history" size={14} weight="bold" /> : null}
              </View>
              <View style={{ flex: 1, opacity: notYet ? 0.5 : 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "700" }}>{p.name}</Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{p.bn}</Text>
                  {isNow ? (
                    <View style={{ paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: c.foreground, justifyContent: "center" }}>
                      <Text style={{ color: c.background, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>NOW</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {st === "prayed" ? "Prayed" : st === "qaza" ? "Qaza · prayed late" : notYet ? "Not time yet" : "Tap when prayed"}
                </Text>
              </View>
              <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"], opacity: notYet ? 0.5 : 1 }}>
                {format(at, "h:mm a")}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
        Tap to mark prayed · press and hold for qaza · sunrise {format(times.sunrise, "h:mm a")}
      </Text>

      {/* ---- stats */}
      {s ? (
        <View style={{ flexDirection: "row", backgroundColor: c.card, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 16 }}>
          <Stat icon="flame" value={String(s.streak)} label={`Day streak · best ${s.best_streak}`} />
          <Stat value={`${s.month_possible ? Math.round((s.month_done / s.month_possible) * 100) : 0}%`} label={`${format(today, "MMMM")} prayed`} />
          <Stat value={String(s.month_qaza)} label="Qaza this month" last />
        </View>
      ) : null}
      <Text style={{ color: c.mutedForeground, fontSize: 11, textAlign: "center" }}>
        Times for {city.name} · Karachi method, Hanafi Asr. Check with your local mosque.
      </Text>

      {/* ---- sheets */}
      <Sheet visible={cityOpen} onClose={() => setCityOpen(false)} title="Your city">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CITIES.map((x) => {
            const sel = x.key === city.key;
            return (
              <Pressable
                key={x.key}
                onPress={() => {
                  setCity(x.key);
                  setCityOpen(false);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  height: 40,
                  borderRadius: 20,
                  justifyContent: "center",
                  backgroundColor: sel ? c.foreground : pressed ? c.muted : c.card,
                  borderWidth: sel ? 0 : 1,
                  borderColor: c.border,
                })}
              >
                <Text style={{ color: sel ? c.background : c.foreground, fontSize: 14, fontWeight: "700" }}>{x.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      <Sheet visible={!!statusFor} onClose={() => setStatusFor(null)} title={statusFor ? PRAYERS.find((p) => p.key === statusFor)!.name : ""}>
        {(
          [
            { status: "prayed", label: "Prayed on time", hint: "Prayed within its time", icon: "check" },
            { status: "qaza", label: "Qaza", hint: "Missed its time and made it up later", icon: "history" },
            { status: null, label: "Not prayed", hint: "Clear this prayer", icon: "warning" },
          ] as const
        ).map((o) => {
          const sel = statusFor ? (marks.get(statusFor) ?? null) === o.status : false;
          return (
            <Pressable
              key={o.label}
              onPress={() => {
                if (statusFor) setMark(statusFor, o.status);
                setStatusFor(null);
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 14,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: sel ? c.foreground : c.border,
                backgroundColor: pressed ? c.muted : c.card,
              })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                <Glyph name={o.icon} size={20} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>{o.label}</Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{o.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </Sheet>
    </Screen>
  );
}

function Stat({ icon, value, label, last }: { icon?: "flame"; value: string; label: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, borderRightWidth: last ? 0 : 1, borderRightColor: c.border, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {icon ? <Glyph name={icon} size={18} weight="fill" /> : null}
        <Text style={{ color: c.foreground, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{value}</Text>
      </View>
      <Text style={{ color: c.mutedForeground, fontSize: 11, fontWeight: "600", marginTop: 2 }} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
