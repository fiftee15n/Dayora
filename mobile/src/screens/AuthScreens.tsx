import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import * as React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, getServer, normalizeServer, setServer } from "../api";
import { useAuth } from "../auth";
import { BRAND, useColors } from "../theme";
import type { AuthOut } from "../types";
import { Button, Card, Icon, Input, PasswordInput, Row, T, errorMessage, toast } from "../ui";

export type AuthStack = {
  Login: undefined;
  Register: undefined;
  Forgot: undefined;
  Reset: { token?: string } | undefined;
};

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingTop: insets.top + 36, paddingBottom: 56, paddingHorizontal: 24, gap: 18 }}>
          <Row gap={10}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Icon name="sun" color="#fff" size={22} />
            </View>
            <T variant="h2" color="#fff">Dayora</T>
          </Row>
          <View style={{ gap: 4 }}>
            <T variant="title" color="#fff">{title}</T>
            <T color="rgba(255,255,255,0.85)">{subtitle}</T>
          </View>
        </LinearGradient>
        <View style={{ marginTop: -28, paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
          <Card style={{ gap: 16, padding: 20 }}>{children}</Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Lets the tester point the app at whichever machine runs the API. */
function ServerSettings() {
  const c = useColors();
  const [open, setOpen] = React.useState(false);
  const [url, setUrl] = React.useState(getServer());
  const [state, setState] = React.useState<"idle" | "testing" | "ok" | "fail">("idle");

  async function save() {
    const value = normalizeServer(url);
    setUrl(value);
    await setServer(value);
    setState("testing");
    try {
      await api("/api/health", { timeoutMs: 6000 });
      setState("ok");
    } catch {
      setState("fail");
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
        <Row gap={6} style={{ justifyContent: "center" }}>
          <Icon name="server" size={14} color={c.mutedForeground} />
          <T variant="caption" muted numberOfLines={1}>Server: {getServer()}</T>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} color={c.mutedForeground} />
        </Row>
      </Pressable>
      {open ? (
        <View style={{ gap: 10 }}>
          <Input
            label="API server URL"
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              setState("idle");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.10:8000"
            hint="Your PC's IP and port 8000. On the Android emulator use http://10.0.2.2:8000"
          />
          <Button
            title={state === "testing" ? "Testing…" : "Save & test connection"}
            variant="outline"
            small
            icon="zap"
            loading={state === "testing"}
            onPress={save}
          />
          {state === "ok" ? <T variant="caption" color={c.success}>Connected ✓</T> : null}
          {state === "fail" ? (
            <T variant="caption" color={c.danger}>
              Can't reach the server. Start it with: uvicorn app.main:app --host 0.0.0.0 --port 8000
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function LoginScreen({ navigation }: NativeStackScreenProps<AuthStack, "Login">) {
  const c = useColors();
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email";
    if (!password) e.password = "Enter your password";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const res = await api<AuthOut>("/api/auth/login", { method: "POST", json: { email: email.trim(), password } });
      await signIn(res);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to make every day count.">
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" error={errors.email} />
      <PasswordInput label="Password" value={password} onChangeText={setPassword} placeholder="Your password" error={errors.password} onSubmitEditing={submit} />
      <Pressable onPress={() => navigation.navigate("Forgot")} style={{ alignSelf: "flex-end" }}>
        <T variant="label" color={c.primary}>Forgot password?</T>
      </Pressable>
      {errors.form ? <T variant="small" color={c.danger}>{errors.form}</T> : null}
      <Button title="Sign in" onPress={submit} loading={loading} />
      <Row gap={4} style={{ justifyContent: "center" }}>
        <T variant="small" muted>New to Dayora?</T>
        <Pressable onPress={() => navigation.navigate("Register")}>
          <T variant="small" weight="700" color={c.primary}>Create an account</T>
        </Pressable>
      </Row>
      <ServerSettings />
    </AuthLayout>
  );
}

export function RegisterScreen({ navigation }: NativeStackScreenProps<AuthStack, "Register">) {
  const c = useColors();
  const { signIn } = useAuth();
  const [form, setForm] = React.useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Enter a valid email";
    if (form.password.length < 8) e.password = "At least 8 characters";
    else if (!/[a-z]/i.test(form.password) || !/\d/.test(form.password)) e.password = "Use letters and numbers";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const res = await api<AuthOut>("/api/auth/register", {
        method: "POST",
        json: { name: form.name.trim(), email: form.email.trim(), password: form.password },
      });
      await signIn(res);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Tasks, money, habits and notes — all in one place.">
      <Input label="Full name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Sara Ahmed" error={errors.name} autoComplete="name" />
      <Input label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" error={errors.email} />
      <PasswordInput label="Password" value={form.password} onChangeText={(password) => setForm({ ...form, password })} placeholder="8+ characters, letters & numbers" error={errors.password} />
      {errors.form ? <T variant="small" color={c.danger}>{errors.form}</T> : null}
      <Button title="Create account" onPress={submit} loading={loading} />
      <Row gap={4} style={{ justifyContent: "center" }}>
        <T variant="small" muted>Already have an account?</T>
        <Pressable onPress={() => navigation.goBack()}>
          <T variant="small" weight="700" color={c.primary}>Sign in</T>
        </Pressable>
      </Row>
      <ServerSettings />
    </AuthLayout>
  );
}

export function ForgotScreen({ navigation }: NativeStackScreenProps<AuthStack, "Forgot">) {
  const c = useColors();
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState<{ message: string; dev_reset_token?: string } | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email");
    setError("");
    setLoading(true);
    try {
      setSent(await api("/api/auth/forgot-password", { method: "POST", json: { email: email.trim() } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="We'll send you a link to choose a new one.">
      {sent ? (
        <>
          <Row gap={10}>
            <Icon name="mail" color={c.success} />
            <T style={{ flex: 1 }}>{sent.message}</T>
          </Row>
          <Button
            title="I have a reset code"
            variant="outline"
            onPress={() => navigation.navigate("Reset", { token: sent.dev_reset_token })}
          />
          {sent.dev_reset_token ? (
            <T variant="caption" muted>Development server: the reset code was filled in for you.</T>
          ) : null}
        </>
      ) : (
        <>
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" error={error} />
          <Button title="Send reset link" onPress={submit} loading={loading} />
        </>
      )}
      <Pressable onPress={() => navigation.navigate("Login")} style={{ alignSelf: "center" }}>
        <T variant="small" weight="700" color={c.primary}>Back to sign in</T>
      </Pressable>
    </AuthLayout>
  );
}

export function ResetScreen({ navigation, route }: NativeStackScreenProps<AuthStack, "Reset">) {
  const [token, setToken] = React.useState(route.params?.token ?? "");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const c = useColors();

  async function submit() {
    const e: Record<string, string> = {};
    if (token.trim().length < 10) e.token = "Paste the code from the reset link";
    if (password.length < 8) e.new_password = "At least 8 characters";
    else if (!/[a-z]/i.test(password) || !/\d/.test(password)) e.new_password = "Use letters and numbers";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", json: { token: token.trim(), new_password: password } });
      toast("Password updated. Please sign in.");
      navigation.navigate("Login");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Enter the code from your email and a new password.">
      <Input label="Reset code" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} error={errors.token} placeholder="From the link in your email" />
      <PasswordInput label="New password" value={password} onChangeText={setPassword} error={errors.new_password} placeholder="8+ characters, letters & numbers" />
      {errors.form ? <T variant="small" color={c.danger}>{errors.form}</T> : null}
      <Button title="Update password" onPress={submit} loading={loading} />
    </AuthLayout>
  );
}
