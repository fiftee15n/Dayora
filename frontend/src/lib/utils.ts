import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(amount: number, currency = "USD", compact = false) {
  const key = `${currency}:${compact}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: compact ? 0 : 2,
        notation: compact ? "compact" : "standard",
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    }
    moneyFormatters.set(key, f);
  }
  return f.format(amount);
}

/** yyyy-MM-dd in the user's local timezone. */
export function toISODate(d: Date = new Date()) {
  return format(d, "yyyy-MM-dd");
}

/** Parse a backend date-only string (yyyy-MM-dd) as a local date. */
export function parseDateOnly(s: string) {
  return parseISO(s);
}

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

export function timeAgo(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

/** Value for <input type="datetime-local"> from an ISO string. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

/** ISO (UTC) from an <input type="datetime-local"> value. */
export function fromLocalInput(v: string) {
  return v ? new Date(v).toISOString() : null;
}

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
  { value: "bank", label: "Bank transfer" },
  { value: "wallet", label: "Mobile wallet" },
  { value: "other", label: "Other" },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "PKR", "INR", "AED", "SAR", "CAD", "AUD", "JPY"];
