"use client";

import * as React from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { api, revalidate } from "@/lib/api";
import type { Reminder } from "@/lib/types";

/**
 * Polls for upcoming reminders and fires a browser notification (or an in-app toast
 * as fallback) when one becomes due while the app is open.
 */
export function ReminderNotifier() {
  const { data } = useSWR<Reminder[]>("/api/reminders?status=upcoming&limit=20", {
    refreshInterval: 60_000,
  });
  const fired = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      const ask = () => Notification.requestPermission().catch(() => {});
      window.addEventListener("click", ask, { once: true });
      return () => window.removeEventListener("click", ask);
    }
  }, []);

  React.useEffect(() => {
    if (!data) return;
    const timers: number[] = [];
    const horizon = Date.now() + 65_000 * 60; // schedule anything in the next ~hour
    for (const r of data) {
      const at = new Date(r.remind_at).getTime();
      const key = `${r.id}:${r.remind_at}`;
      if (at > horizon || fired.current.has(key)) continue;
      const delay = Math.max(0, at - Date.now());
      timers.push(
        window.setTimeout(() => {
          fired.current.add(key);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(`⏰ ${r.title}`, { body: r.description ?? "Reminder from Dayora", icon: "/icon.svg" });
          }
          toast(`⏰ ${r.title}`, {
            description: r.description ?? "It's time!",
            duration: 15_000,
            action: {
              label: "Done",
              onClick: async () => {
                await api(`/api/reminders/${r.id}/complete`, { method: "POST" });
                revalidate("/api/reminders", "/api/dashboard");
              },
            },
          });
        }, delay),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [data]);

  return null;
}
