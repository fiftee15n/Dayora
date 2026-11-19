import * as React from "react";
import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { useColors } from "./theme";
import { Row, T } from "./ui";

/** Grouped vertical bars. Each series is drawn side by side for every label. */
export function BarChart({
  labels,
  series,
  height = 140,
  format,
}: {
  labels: string[];
  series: { color: string; values: number[]; name: string }[];
  height?: number;
  format?: (v: number) => string;
}) {
  const c = useColors();
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const showEvery = labels.length > 10 ? Math.ceil(labels.length / 7) : 1;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height, flexDirection: "row", alignItems: "flex-end", gap: labels.length > 14 ? 2 : 6 }}>
        {labels.map((_, i) => (
          <View key={i} style={{ flex: 1, height, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
            {series.map((s) => {
              const v = s.values[i] ?? 0;
              return (
                <View
                  key={s.name}
                  style={{
                    flex: 1,
                    height: v > 0 ? Math.max(3, (v / max) * height) : 3,
                    borderRadius: 4,
                    backgroundColor: v > 0 ? s.color : c.muted,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: labels.length > 14 ? 2 : 6 }}>
        {labels.map((l, i) => (
          <T key={i} variant="caption" muted numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 10 }}>
            {i % showEvery === 0 ? l : ""}
          </T>
        ))}
      </View>
      {series.length > 1 || format ? (
        <Row gap={14} style={{ flexWrap: "wrap" }}>
          {series.map((s) => (
            <Row key={s.name} gap={6}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
              <T variant="caption" muted>
                {s.name}
                {format ? ` · ${format(s.values.reduce((a, b) => a + b, 0))}` : ""}
              </T>
            </Row>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** Donut chart for category breakdowns. */
export function Donut({
  data,
  size = 150,
  stroke = 22,
  center,
}: {
  data: { value: number; color: string }[];
  size?: number;
  stroke?: number;
  center?: React.ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((a, d) => a + d.value, 0);
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.muted} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * circ;
              const el = (
                <Circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={d.color}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${Math.max(0, len - 2)} ${circ}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      {center}
    </View>
  );
}

/** Circular progress ring. */
export function Ring({ value, size = 64, stroke = 7, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.muted} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? c.primary}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(v / 100) * circ} ${circ}`}
          />
        </G>
      </Svg>
      {children}
    </View>
  );
}
