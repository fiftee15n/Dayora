import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import * as React from "react";
import { Pressable, View } from "react-native";

import { api, ApiError, getServer, setServer, setToken } from "../api";
import { useAuth, useUser } from "../auth";
import { useColors } from "../theme";
import type { AuthOut, User } from "../types";
import { Avatar, Button, Card, CardHeader, Chips, Divider, Field, Icon, Input, PasswordInput, Row, Screen, T, confirm, errorMessage, toast } from "../ui";
import { CURRENCIES } from "../utils";

export function SettingsScreen() {
  const nav = useNavigation<any>();
  return (
    <Screen title="Settings" subtitle="Profile, security and app" back={() => nav.goBack()}>
      <ProfileCard />
      <PasswordCard />
      <ServerCard />
      <AccountCard />
      <T variant="caption" muted style={{ textAlign: "center" }}>Dayora · Make every day count</T>
    </Screen>
  );
}

function ProfileCard() {
  const c = useColors();
  const user = useUser();
  const { setUser } = useAuth();
  const [form, setForm] = React.useState({ name: user.name, email: user.email, currency: user.currency });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => setForm({ name: user.name, email: user.email, currency: user.currency }), [user]);
  const dirty = form.name !== user.name || form.email !== user.email || form.currency !== user.currency;

  async function save() {
    setSaving(true);
    setErrors({});
    try {
      setUser(await api<User>("/api/users/me", { method: "PATCH", json: { ...form, name: form.name.trim(), email: form.email.trim() } }));
      toast("Profile saved");
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

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

  async function removeAvatar() {
    try {
      setUser(await api<User>("/api/users/me/avatar", { method: "DELETE" }));
      toast("Profile picture removed");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Card style={{ gap: 16 }}>
      <CardHeader title="Profile" />
      <Row gap={16}>
        <Pressable onPress={pickAvatar}>
          <Avatar name={user.name} url={user.avatar_url} size={72} />
          <View style={{ position: "absolute", right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.card }}>
            <Icon name="camera" size={14} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="h3" numberOfLines={1}>{user.name}</T>
          <T variant="small" muted numberOfLines={1}>{uploading ? "Uploading…" : user.email}</T>
          {user.avatar_url && !uploading ? (
            <Pressable onPress={removeAvatar}>
              <T variant="caption" weight="600" color={c.danger}>Remove photo</T>
            </Pressable>
          ) : null}
        </View>
      </Row>
      <Input label="Full name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} error={errors.name} />
      <Input label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" keyboardType="email-address" error={errors.email} />
      <Field label="Currency">
        <Chips options={CURRENCIES.map((x) => ({ value: x, label: x }))} value={form.currency} onChange={(currency) => setForm({ ...form, currency })} />
      </Field>
      <Button title="Save profile" onPress={save} loading={saving} disabled={!dirty} />
    </Card>
  );
}

function PasswordCard() {
  const { signIn } = useAuth();
  const [form, setForm] = React.useState({ current: "", next: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

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
      await signIn(res); // other devices are signed out; keep this one with the fresh token
      setForm({ current: "", next: "" });
      toast("Password changed. Other devices were signed out.");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ current_password: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ gap: 16 }}>
      <CardHeader title="Password" />
      <PasswordInput label="Current password" value={form.current} onChangeText={(current) => setForm({ ...form, current })} error={errors.current_password} />
      <PasswordInput label="New password" value={form.next} onChangeText={(next) => setForm({ ...form, next })} error={errors.new_password} hint="8+ characters with letters and numbers" />
      <Button title="Change password" variant="secondary" onPress={save} loading={saving} />
    </Card>
  );
}

function ServerCard() {
  const c = useColors();
  const { reload } = useAuth();
  const [url, setUrl] = React.useState(getServer());
  const [testing, setTesting] = React.useState(false);

  async function save() {
    setTesting(true);
    const previous = getServer();
    await setServer(url);
    setUrl(getServer());
    try {
      await api("/api/health", { timeoutMs: 6000 });
      await reload().catch(() => {});
      toast("Connected ✓");
    } catch {
      await setServer(previous);
      setUrl(previous);
      toast("Can't reach that server — kept the previous one");
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <CardHeader title="Server" />
      <T variant="small" muted>The Dayora API this app talks to.</T>
      <Input value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" right={<Icon name="server" size={16} color={c.mutedForeground} />} />
      <Button title="Save & test" variant="outline" small icon="zap" onPress={save} loading={testing} disabled={url === getServer()} />
    </Card>
  );
}

function AccountCard() {
  const c = useColors();
  const { signOut } = useAuth();

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
    <Card style={{ gap: 12 }}>
      <CardHeader title="Account" />
      <Button title="Sign out" variant="outline" icon="log-out" onPress={() => signOut()} />
      <Button
        title="Sign out of all devices"
        variant="outline"
        icon="smartphone"
        onPress={async () => {
          if (await confirm("Sign out everywhere?", "You'll be signed out on every browser and phone.", "Sign out", false)) signOut({ everywhere: true });
        }}
      />
      <Divider />
      <T variant="small" color={c.danger} weight="600">Danger zone</T>
      <Button title="Delete account" variant="danger" icon="trash-2" onPress={deleteAccount} />
    </Card>
  );
}
