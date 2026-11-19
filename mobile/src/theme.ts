import { useColorScheme } from "react-native";

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

const dark: Colors = {
  background: "#0B0F1E",
  foreground: "#E6E8F2",
  card: "#121731",
  muted: "#1A2040",
  mutedForeground: "#94A0BF",
  border: "#232A4B",
  input: "#2A3256",
  primary: "#818CF8",
  primaryForeground: "#0B0F1E",
  primarySoft: "#1F2452",
  accent: "#A78BFA",
  accentSoft: "#2A2152",
  success: "#34D399",
  successSoft: "#0F2F2A",
  warning: "#FBBF24",
  warningSoft: "#33280F",
  danger: "#F87171",
  dangerSoft: "#3A1A20",
};

export const BRAND = ["#0A0A0A", "#262626"] as const;

// The app always uses the light theme. To follow the phone's setting again, set this to
// null (and "userInterfaceStyle" in app.json back to "automatic").
const FORCED_SCHEME: "light" | "dark" | null = "light";

function useScheme() {
  const system = useColorScheme();
  return FORCED_SCHEME ?? system;
}

export function useColors(): Colors {
  return useScheme() === "dark" ? dark : light;
}

export function useIsDark() {
  return useScheme() === "dark";
}

export const radius = 14;
