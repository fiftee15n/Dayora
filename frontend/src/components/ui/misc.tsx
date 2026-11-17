import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  color,
}: {
  value: number;
  className?: string;
  color?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="brand-gradient h-full rounded-full transition-[width] duration-500"
        style={{ width: `${v}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-6" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  color,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  color?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md border-2 transition-all",
        checked ? "border-transparent text-white" : "border-input hover:border-primary",
        className,
      )}
      style={checked ? { background: color ?? "var(--primary)" } : undefined}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.5}>
          <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex max-w-full overflow-x-auto rounded-xl bg-muted p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const TONES = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};
export type Tone = keyof typeof TONES;

export function IconTile({ icon: Icon, tone = "primary", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONES[tone], className)}>
      <Icon className="size-5" />
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "primary",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <IconTile icon={icon} tone={tone} />
      </div>
      {sub && <div className="mt-3 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
