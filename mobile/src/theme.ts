import { useColorScheme } from "react-native";

const light = {
  background: "#F6F7FB",
  foreground: "#0F172A",
  card: "#FFFFFF",
  muted: "#F1F3F9",
  mutedForeground: "#64748B",
  border: "#E5E7F0",
  input: "#E2E5EF",
  primary: "#6366F1",
  primaryForeground: "#FFFFFF",
  primarySoft: "#EEF0FF",
  accent: "#8B5CF6",
  accentSoft: "#F3EEFF",
  success: "#10B981",
  successSoft: "#E7F8F1",
  warning: "#F59E0B",
  warningSoft: "#FEF5E4",
  danger: "#EF4444",
  dangerSoft: "#FDECEC",
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

export const BRAND = ["#6366F1", "#8B5CF6"] as const;

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
