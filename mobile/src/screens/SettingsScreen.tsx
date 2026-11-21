import { useNavigation } from "@react-navigation/native";
import { format } from "date-fns/format";
import * as ImagePicker from "expo-image-picker";
import * as React from "react";
import { AppState, Image, Linking, Pressable, ScrollView, Share, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, setToken } from "../api";
import { useAuth, useUser } from "../auth";
import { Glyph, type GlyphName } from "../icons";
import { getNotificationPermission, getReminderAlertsEnabled, setReminderAlertsEnabled } from "../notifications";
import { type ThemeMode, setThemeMode, useColors, useIsDark, useThemeMode } from "../theme";
import type { AuthOut, User } from "../types";
import { Avatar, Button, Input, PasswordInput, Sheet, confirm, errorMessage, toast } from "../ui";
import { CURRENCIES, formatMoney } from "../utils";

/* Settings — grouped list in the app's black-and-white style. Each row opens a focused sheet,
   so the main page stays short and scannable. */

type SheetName = null | "profile" | "password" | "currency" | "theme" | "notifications";

const THEME_LABEL: Record<ThemeMode, string> = { light: "Light", dark: "Dark", system: "System" };

export function SettingsScreen() {
  const c = useColors();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useUser();
  const { signOut, setUser } = useAuth();
  const themeMode = useThemeMode();
  const [sheet, setSheet] = React.useState<SheetName>(null);
  const [alerts, setAlerts] = React.useState<boolean | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const refreshAlerts = React.useCallback(async () => {
    const [on, perm] = await Promise.all([getReminderAlertsEnabled(), getNotificationPermission().catch(() => ({ granted: false }))]);
    setAlerts(on && perm.granted);
  }, []);

  React.useEffect(() => {
    refreshAlerts();
    // The permission can change in Android settings while we're away.
    const sub = AppState.addEventListener("change", (s) => s === "active" && refreshAlerts());
    return () => sub.remove();
  }, [refreshAlerts]);

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast("Allow photo access to set a profile picture");
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > 2 * 1024 * 1024) return toast("Image must be 2 MB or smaller");
    const body = new FormData();
    const mime = a.mimeType ?? "image/jpeg";
    body.append("file", { uri: a.uri, name: a.fileName ?? `avatar.${mime.split("/")[1] ?? "jpg"}`, type: mime } as unknown as Blob);
    setUploading(true);
    try {
      setUser(await api<User>("/api/users/me/avatar", { method: "POST", body, timeoutMs: 30000 }));
      toast("Profile picture updated");
    } catch (e) {
      toast(errorMessage(e, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const data = await api<unknown>("/api/users/me/export", { timeoutMs: 30000 });
      await Share.share({ title: "Dayora data export", message: JSON.stringify(data, null, 2) });
    } catch (e) {
      toast(errorMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  async function logOut() {
    if (await confirm("Log out?", "You can sign back in any time.", "Log out", false, "sign-out")) signOut();
  }

  async function deleteAccount() {
    if (!(await confirm("Delete account?", "This permanently deletes your account and all your data. This can't be undone.", "Delete forever"))) return;
    try {
      await api("/api/users/me", { method: "DELETE" });
      await setToken(null);
      await signOut({ skipServer: true });
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
        {/* ---------------------------------------------- header */}
        <View style={{ flexDirection: "row", alignItems: "center", height: 48 }}>
          <Pressable
            onPress={() => nav.goBack()}
            hitSlop={10}
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: pressed ? c.muted : c.card,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Glyph name="caret-left" size={20} weight="bold" />
          </Pressable>
        </View>
        <Text style={{ color: c.foreground, fontSize: 32, fontWeight: "800", letterSpacing: -0.8, marginTop: 14 }}>Settings</Text>

        {/* ---------------------------------------------- profile */}
        <View style={{ marginTop: 20, padding: 18, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={pickAvatar} accessibilityLabel="Change profile picture">
            <Avatar name={user.name} url={user.avatar_url} size={64} />
            <View
              style={{
                position: "absolute",
                right: -3,
                bottom: -3,
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: c.foreground,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: c.card,
              }}
            >
              <Glyph name="camera" size={13} color={c.background} weight="fill" />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.foreground, fontSize: 18, fontWeight: "800" }} numberOfLines={1}>{user.name}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }} numberOfLines={1}>{uploading ? "Uploading photo…" : user.email}</Text>
            <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 6 }}>Member since {format(new Date(user.created_at), "MMMM yyyy")}</Text>
          </View>
          <Pressable
            onPress={() => setSheet("profile")}
            style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: c.foreground, justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
          >
            <Text style={{ color: c.background, fontSize: 13, fontWeight: "700" }}>Edit</Text>
          </Pressable>
        </View>

        {/* ---------------------------------------------- groups */}
        <Group title="Personal">
          <Row icon="user" title="Personal info" value={user.name} onPress={() => setSheet("profile")} first />
          <Row icon="lock" title="Password & security" onPress={() => setSheet("password")} />
          <Row icon="coins" title="Currency" value={user.currency} onPress={() => setSheet("currency")} />
        </Group>

        <Group title="Preferences">
          <Row icon="circle-half" title="Theme" value={THEME_LABEL[themeMode]} onPress={() => setSheet("theme")} first />
          <Row icon="bell-simple" title="Notifications" value={alerts === null ? "" : alerts ? "On" : "Off"} onPress={() => setSheet("notifications")} />
        </Group>

        <Group title="Data">
          <Row icon="download" title="Export my data" value={exporting ? "Preparing…" : undefined} onPress={exportData} first />
        </Group>

        {/* ---------------------------------------------- session */}
        <Pressable
          onPress={logOut}
          style={({ pressed }) => ({
            marginTop: 28,
            height: 54,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: c.foreground,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            backgroundColor: pressed ? c.muted : "transparent",
          })}
        >
          <Glyph name="sign-out" size={20} weight="bold" />
          <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "800" }}>Log out</Text>
        </Pressable>
        <Pressable onPress={deleteAccount} hitSlop={8} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 }}>
          <Glyph name="trash" size={16} color={c.danger} weight="bold" />
          <Text style={{ color: c.danger, fontSize: 14, fontWeight: "700" }}>Delete account</Text>
        </Pressable>
        <Image
          source={require("../../assets/wordmark.png")}
          style={{ width: 96, height: 28, alignSelf: "center", marginTop: 28, tintColor: c.mutedForeground }}
          resizeMode="contain"
          accessibilityLabel="Dayora"
        />
        <Text style={{ color: c.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 6 }}>Make every day count</Text>
      </ScrollView>

      <ProfileSheet visible={sheet === "profile"} onClose={() => setSheet(null)} />
      <PasswordSheet visible={sheet === "password"} onClose={() => setSheet(null)} />
      <CurrencySheet visible={sheet === "currency"} onClose={() => setSheet(null)} />
      <ThemeSheet visible={sheet === "theme"} onClose={() => setSheet(null)} />
      <NotificationsSheet visible={sheet === "notifications"} onClose={() => setSheet(null)} onChanged={refreshAlerts} />
    </View>
  );
}

// ================================================================ list building blocks

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginLeft: 4 }}>{title.toUpperCase()}</Text>
      <View style={{ borderRadius: 22, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>{children}</View>
    </View>
  );
}

function Row({ icon, title, value, onPress, first }: { icon: GlyphName; title: string; value?: string; onPress?: () => void; first?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 13 },
        !first && { borderTopWidth: 1, borderTopColor: c.border },
        pressed && { backgroundColor: c.muted },
      ]}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={21} />
      </View>
      <Text style={{ flex: 1, color: c.foreground, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
        {title}
      </Text>
      {value ? (
        <Text style={{ color: c.mutedForeground, fontSize: 14, maxWidth: "45%" }} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <Glyph name="caret-right" size={15} color={c.mutedForeground} weight="bold" /> : null}
    </Pressable>
  );
}

/** A selectable option row with a radio mark, used in the theme and currency sheets. */
function Choice({ label, hint, icon, selected, onPress }: { label: string; hint?: string; icon?: GlyphName; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: selected ? c.foreground : c.border,
        backgroundColor: pressed ? c.muted : c.card,
      })}
    >
      {icon ? (
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
          <Glyph name={icon} size={21} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>{label}</Text>
        {hint ? <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: selected ? 0 : 1.5,
          borderColor: c.input,
          backgroundColor: selected ? c.foreground : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <Glyph name="check" size={12} color={c.background} weight="bold" /> : null}
      </View>
    </Pressable>
  );
}

// ================================================================ sheets

function ProfileSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const user = useUser();
  const { setUser } = useAuth();
  const [form, setForm] = React.useState({ name: user.name, email: user.email });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setForm({ name: user.name, email: user.email });
      setErrors({});
    }
  }, [visible, user]);

  const dirty = form.name.trim() !== user.name || form.email.trim() !== user.email;

  async function save() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Enter a valid email";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      setUser(await api<User>("/api/users/me", { method: "PATCH", json: { name: form.name.trim(), email: form.email.trim() } }));
      toast("Personal info saved");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else toast(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    try {
      setUser(await api<User>("/api/users/me/avatar", { method: "DELETE" }));
      toast("Profile picture removed");
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Personal info" footer={<Button title="Save changes" onPress={save} loading={saving} disabled={!dirty} />}>
      <Input label="Full name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} error={errors.name} autoComplete="name" autoCapitalize="words" />
      <Input
        label="Email"
        value={form.email}
        onChangeText={(email) => setForm({ ...form, email })}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        error={errors.email}
      />
      {user.avatar_url ? (
        <Pressable onPress={removePhoto} style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
          <Glyph name="trash" size={16} color={c.danger} weight="bold" />
          <Text style={{ color: c.danger, fontSize: 14, fontWeight: "700" }}>Remove profile picture</Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}

function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const { signIn, signOut } = useAuth();
  const [form, setForm] = React.useState({ current: "", next: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setForm({ current: "", next: "" });
      setErrors({});
    }
  }, [visible]);

  async function save() {
    const e: Record<string, string> = {};
    if (!form.current) e.current_password = "Enter your current password";
    if (form.next.length < 8) e.new_password = "At least 8 characters";
    else if (!/[a-z]/i.test(form.next) || !/\d/.test(form.next)) e.new_password = "Use letters and numbers";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const res = await api<AuthOut>("/api/users/me/password", { method: "POST", json: { current_password: form.current, new_password: form.next } });
      await signIn(res); // other devices are signed out; this one keeps a fresh token
      toast("Password changed. Other devices were signed out.");
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ current_password: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function signOutEverywhere() {
    if (await confirm("Log out everywhere?", "You'll be logged out on every browser and phone, including this one.", "Log out", false, "device")) {
      onClose();
      signOut({ everywhere: true });
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Password & security" footer={<Button title="Change password" onPress={save} loading={saving} />}>
      <PasswordInput label="Current password" value={form.current} onChangeText={(current) => setForm({ ...form, current })} error={errors.current_password} />
      <PasswordInput
        label="New password"
        value={form.next}
        onChangeText={(next) => setForm({ ...form, next })}
        error={errors.new_password}
        hint="8+ characters with letters and numbers"
      />
      <View style={{ height: 1, backgroundColor: c.border }} />
      <Pressable
        onPress={signOutEverywhere}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, backgroundColor: pressed ? c.muted : c.card, borderWidth: 1, borderColor: c.border })}
      >
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
          <Glyph name="device" size={21} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>Log out of all devices</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>Use this if you lost a phone or shared your password</Text>
        </View>
      </Pressable>
    </Sheet>
  );
}

function CurrencySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const user = useUser();
  const { setUser } = useAuth();
  const [saving, setSaving] = React.useState<string | null>(null);

  async function pick(currency: string) {
    if (currency === user.currency) return onClose();
    setSaving(currency);
    try {
      setUser(await api<User>("/api/users/me", { method: "PATCH", json: { currency } }));
      toast(`Currency set to ${currency}`);
      onClose();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Currency">
      {CURRENCIES.map((cur) => (
        <Choice key={cur} label={cur} hint={saving === cur ? "Saving…" : `e.g. ${formatMoney(1250, cur)}`} selected={user.currency === cur} onPress={() => pick(cur)} />
      ))}
    </Sheet>
  );
}

function ThemeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const mode = useThemeMode();
  const options: { value: ThemeMode; label: string; hint: string; icon: GlyphName }[] = [
    { value: "light", label: "Light", hint: "White background, black text", icon: "sun-dim" },
    { value: "dark", label: "Dark", hint: "Black background, easy on the eyes at night", icon: "moon-stars" },
    { value: "system", label: "System", hint: "Match your phone's setting", icon: "circle-half" },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Theme">
      {options.map((o) => (
        <Choice key={o.value} label={o.label} hint={o.hint} icon={o.icon} selected={mode === o.value} onPress={() => setThemeMode(o.value)} />
      ))}
    </Sheet>
  );
}

function NotificationsSheet({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const c = useColors();
  const dark = useIsDark();
  const [enabled, setEnabled] = React.useState(false);
  const [blocked, setBlocked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const [on, perm] = await Promise.all([getReminderAlertsEnabled(), getNotificationPermission().catch(() => ({ granted: false, canAskAgain: false }))]);
    setEnabled(on && perm.granted);
    setBlocked(!perm.granted && !perm.canAskAgain);
  }, []);

  React.useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      const result = await setReminderAlertsEnabled(next);
      setEnabled(result);
      if (next && !result) {
        setBlocked(true);
        toast("Notifications are blocked. Allow them in Android settings.");
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Notifications">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
          <Glyph name="bell-ringing" size={21} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontWeight: "700" }}>Reminder alerts</Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>A notification when a reminder is due, even when the app is closed</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={busy}
          trackColor={{ false: c.input, true: c.foreground }}
          thumbColor={dark ? (enabled ? "#0A0A0A" : "#A3A3A3") : "#FFFFFF"}
        />
      </View>
      {blocked ? (
        <Pressable onPress={() => Linking.openSettings()} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, backgroundColor: c.muted }}>
          <Glyph name="warning" size={20} />
          <Text style={{ flex: 1, color: c.foreground, fontSize: 13 }}>Notifications are turned off for Dayora in Android settings.</Text>
          <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "800" }}>Open</Text>
        </Pressable>
      ) : null}
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Alerts are scheduled for reminders in the next 14 days and refresh whenever you open the app.</Text>
    </Sheet>
  );
}
