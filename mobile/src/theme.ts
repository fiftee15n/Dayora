import * as SecureStore from "expo-secure-store";
import * as React from "react";
import { Appearance, useColorScheme } from "react-native";

/** Black-and-white palette. Colour is reserved for meaning (overspend, errors, warnings). */
const light = {
  background: "#FAFAFA",
  foreground: "#0A0A0A",
  card: "#FFFFFF",
  muted: "#F4F4F4",
  mutedForeground: "#737373",
  border: "#EBEBEB",
  input: "#E5E5E5",
  primary: "#0A0A0A",
  primaryForeground: "#FFFFFF",
  primarySoft: "#F2F2F2",
  accent: "#404040",
  accentSoft: "#F2F2F2",
  success: "#0A0A0A",
  successSoft: "#F2F2F2",
  warning: "#B45309",
  warningSoft: "#FDF6EC",
  danger: "#D92D20",
  dangerSoft: "#FDEEEC",
};

export type Colors = typeof light;

/** Dark mode: the same black-and-white system, inverted. */
const dark: Colors = {
  background: "#0A0A0A",
  foreground: "#FAFAFA",
  card: "#141414",
  muted: "#1C1C1C",
  mutedForeground: "#A3A3A3",
  border: "#262626",
  input: "#2E2E2E",
  primary: "#FAFAFA",
  primaryForeground: "#0A0A0A",
  primarySoft: "#1F1F1F",
  accent: "#D4D4D4",
  accentSoft: "#1F1F1F",
  success: "#FAFAFA",
  successSoft: "#1F1F1F",
  warning: "#F59E0B",
  warningSoft: "#2A1F0A",
  danger: "#FF5A4E",
  dangerSoft: "#2A1210",
};

export const LIGHT_COLORS = light;

/** Kept for older call sites; prefer [c.primary, c.accent] from useColors(). */
export const BRAND = ["#0A0A0A", "#262626"] as const;

// ---------------------------------------------------------------- theme preference

export type ThemeMode = "light" | "dark" | "system";
const THEME_KEY = "dayora_theme";

let mode: ThemeMode = "light"; // default until the saved choice loads
const listeners = new Set<() => void>();

function applyNative(m: ThemeMode) {
  // Native parts (date pickers, system dialogs) follow the same choice.
  try {
    Appearance.setColorScheme(m === "system" ? "unspecified" : m);
  } catch {
    // older React Native: ignore
  }
}

export function setThemeMode(m: ThemeMode) {
  mode = m;
  applyNative(m);
  listeners.forEach((l) => l());
  SecureStore.setItemAsync(THEME_KEY, m).catch(() => {});
}

// Load the saved choice once at startup.
SecureStore.getItemAsync(THEME_KEY)
  .then((v) => {
    if (v === "light" || v === "dark" || v === "system") {
      if (v !== mode) setThemeMode(v);
      else applyNative(v);
    } else applyNative(mode);
  })
  .catch(() => applyNative(mode));

export function useThemeMode(): ThemeMode {
  return React.useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => mode,
  );
}

function useScheme(): "light" | "dark" {
  const m = useThemeMode();
  const system = useColorScheme();
  if (m === "system") return system === "dark" ? "dark" : "light";
  return m;
}

export function useColors(): Colors {
  return useScheme() === "dark" ? dark : light;
}

export function useIsDark() {
  return useScheme() === "dark";
}

export const radius = 14;
