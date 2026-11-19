import { format } from "date-fns/format";
import { formatDistanceToNowStrict } from "date-fns/formatDistanceToNowStrict";
import { isToday } from "date-fns/isToday";
import { isTomorrow } from "date-fns/isTomorrow";
import { isYesterday } from "date-fns/isYesterday";
import { parseISO } from "date-fns/parseISO";

const SYMBOLS: Record<string, string> = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
  GBP: "£",
  PKR: "Rs",
  INR: "₹",
  AED: "AED ",
  SAR: "SAR ",
  CAD: "CA$",
  AUD: "A$",
  JPY: "¥",
};

/** Hermes' Intl support varies by build, so money is formatted by hand. */
export function formatMoney(amount: number, currency = "BDT", compact = false) {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const sym = SYMBOLS[currency] ?? `${currency} `;
  if (compact && abs >= 1000) {
    const units: [number, string][] = [
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [v, u] of units) {
      if (abs >= v) {
        const n = abs / v;
        return `${sign}${sym}${n >= 100 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}${u}`;
      }
    }
  }
  const digits = compact || currency === "JPY" ? 0 : 2;
  const [int, frac] = abs.toFixed(digits).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${sym}${grouped}${frac ? `.${frac}` : ""}`;
}

export const toISODate = (d: Date = new Date()) => format(d, "yyyy-MM-dd");
export const parseDateOnly = (s: string) => parseISO(s);

export function friendlyDay(d: Date) {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

export function friendlyDateTime(iso: string) {
  const d = new Date(iso);
  return `${friendlyDay(d)} · ${format(d, "h:mm a")}`;
}

export const timeAgo = (iso: string) => formatDistanceToNowStrict(new Date(iso), { addSuffix: true });

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "wallet", label: "Mobile wallet" },
  { value: "other", label: "Other" },
];

export const CURRENCIES = ["BDT", "USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "JPY"];

export const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const RECURRENCES = [
  { value: "none", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
] as const;

export const SWATCHES = ["#6366F1", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B", "#10B981", "#0EA5E9", "#64748B"];

/** Add alpha to a #RRGGBB colour. */
export function alpha(hex: string, a: number) {
  const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${v}` : hex;
}
