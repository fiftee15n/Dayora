import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api, qs } from "./api";
import type { Reminder } from "./types";
import { toISODate } from "./utils";

const CHANNEL = "reminders";
const DAYS_AHEAD = 14;
const MAX_SCHEDULED = 60; // Android caps pending alarms per app; stay well below.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let permission: boolean | null = null;

export async function ensureNotificationPermission() {
  if (permission !== null) return permission;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#6366F1",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  permission = granted;
  return granted;
}

export async function cancelAllReminderNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

let syncing = false;

/** Re-schedule local notifications for every reminder due in the next two weeks. */
export async function syncReminderNotifications() {
  if (syncing) return;
  syncing = true;
  try {
    if (!(await ensureNotificationPermission())) return;
    const now = new Date();
    const end = new Date(now.getTime() + DAYS_AHEAD * 86400_000);
    const reminders = await api<Reminder[]>(
      `/api/reminders${qs({ start: toISODate(now), end: toISODate(end), expand: true })}`,
    );
    await Notifications.cancelAllScheduledNotificationsAsync();
    const upcoming = reminders
      .filter((r) => !r.completed && new Date(r.remind_at) > now)
      .slice(0, MAX_SCHEDULED);
    for (const r of upcoming) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: r.title,
          body: r.description || "Reminder from Dayora",
          data: { reminderId: r.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(r.remind_at),
          channelId: CHANNEL,
        },
      });
    }
  } catch {
    // Best effort: notifications must never break the app.
  } finally {
    syncing = false;
  }
}
