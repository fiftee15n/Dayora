"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id per instance: a duplicate id inside a hidden (display:none)
  // element would otherwise break the gradient for every other logo on the page.
  const gid = `dayora-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <path
        d="M20 16h11c10 0 17 6.7 17 16s-7 16-17 16H20z"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <circle cx="31" cy="32" r="5" fill="#fff" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className="text-lg font-bold tracking-tight">Dayora</p>
        <p className="text-[11px] font-medium text-muted-foreground">Make Every Day Count</p>
      </div>
    </div>
  );
}
