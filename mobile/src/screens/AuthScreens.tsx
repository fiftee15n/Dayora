import { FontAwesome } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, getServer, normalizeServer, setServer } from "../api";
import { useAuth } from "../auth";
import { getGoogleIdToken, googleSignOut } from "../google";
import type { AuthOut } from "../types";
import { Icon, type IconName, Sheet, errorMessage, toast } from "../ui";

export type AuthStack = {
  Login: undefined;
  Register: undefined;
  Verify: { email: string; resendIn?: number; devCode?: string };
  Forgot: undefined;
  Reset: { email: string; devCode?: string };
};

/** Black-and-white palette used only by the sign-in screens. */
const M = {
  bg: "#FFFFFF",
  ink: "#0A0A0A",
  sub: "#6B6B6B",
  faint: "#A3A3A3",
  field: "#F5F5F5",
  line: "#E8E8E8",
  error: "#D92D20",
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Response of POST /api/auth/signup/start and /signup/resend. */
type SignupStartOut = { message: string; email: string; expires_in: number; resend_in: number; dev_code?: string | null };

// ---------------------------------------------------------------- sizing

type Sizes = ReturnType<typeof computeSizes>;

/**
 * Every size on the auth screens scales between a compact phone (~640dp of usable height)
 * and a tall one (~840dp), so the whole form fits on one screen without scrolling.
 */
function computeSizes(width: number, usableHeight: number) {
  const t = Math.min(1, Math.max(0, (usableHeight - 640) / 200));
  const l = (a: number, b: number) => Math.round(a + (b - a) * t);
  return {
    pad: width < 360 ? 18 : 24,
    topPad: l(4, 16),
    logo: l(48, 64),
    title: l(24, 30),
    subtitle: l(13, 15),
    titleGap: l(10, 18),
    headerBottom: l(16, 30),
    gap: l(10, 16),
    label: l(13, 15),
    labelGap: l(5, 8),
    field: l(46, 56),
    fieldFont: l(15, 16),
    button: l(48, 56),
    social: l(46, 54),
    text: l(13, 15),
    small: l(12, 13),
  };
}

const SizesContext = React.createContext<Sizes>(computeSizes(400, 800));
const useSizes = () => React.useContext(SizesContext);

// ---------------------------------------------------------------- building blocks

function Logo({ onLongPress }: { onLongPress?: () => void }) {
  const z = useSizes();
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={800} hitSlop={8} accessibilityLabel="Dayora">
      <View
        style={{
          width: z.logo,
          height: z.logo,
          borderRadius: Math.round(z.logo * 0.3),
          backgroundColor: M.ink,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: M.bg, fontSize: Math.round(z.logo * 0.53), fontWeight: "800", marginTop: -2 }}>d</Text>
      </View>
    </Pressable>
  );
}

function AuthLayout({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const z = React.useMemo(() => computeSizes(width, height - insets.top - insets.bottom), [width, height, insets.top, insets.bottom]);
  const [serverOpen, setServerOpen] = React.useState(false);
  return (
    <SizesContext.Provider value={z}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: M.bg }}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + z.topPad,
            paddingBottom: insets.bottom + 12,
            paddingHorizontal: z.pad,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Centred column, capped in width so it also looks right on tablets and in landscape. */}
          <View style={{ flexGrow: 1, width: "100%", maxWidth: 440, alignSelf: "center", justifyContent: "center" }}>
            <View style={{ alignItems: "center", marginBottom: z.headerBottom }}>
              {/* Long-press the logo to change the API server (hidden; for testing). */}
              <Logo onLongPress={() => setServerOpen(true)} />
              <Text
                style={{ color: M.ink, fontSize: z.title, fontWeight: "800", letterSpacing: -0.5, marginTop: z.titleGap, textAlign: "center" }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {title}
              </Text>
              <Text style={{ color: M.sub, fontSize: z.subtitle, marginTop: 4, textAlign: "center" }}>{subtitle}</Text>
            </View>

            <View style={{ gap: z.gap }}>{children}</View>
          </View>
        </ScrollView>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={14}
            accessibilityLabel="Back"
            style={({ pressed }) => ({ position: "absolute", top: insets.top + 8, left: z.pad - 10, padding: 4, opacity: pressed ? 0.5 : 1 })}
          >
            <Icon name="chevron-left" size={28} color={M.ink} />
          </Pressable>
        ) : null}
        <ServerSheet visible={serverOpen} onClose={() => setServerOpen(false)} />
      </KeyboardAvoidingView>
    </SizesContext.Provider>
  );
}

function OrDivider() {
  const z = useSizes();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: M.line }} />
      <Text style={{ color: M.faint, fontSize: z.small }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: M.line }} />
    </View>
  );
}

/** "Continue with Google": native account picker -> ID token -> our API -> signed in. */
function GoogleButton({ label }: { label: string }) {
  const z = useSizes();
  const { signIn } = useAuth();
  const [busy, setBusy] = React.useState(false);

  async function onPress() {
    if (busy) return;
    setBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return; // cancelled
      const res = await api<AuthOut>("/api/auth/google", { method: "POST", json: { id_token: idToken } });
      await signIn(res);
    } catch (err) {
      await googleSignOut(); // let the user pick an account again next time
      toast(errorMessage(err, "Google sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: z.social,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: M.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? M.field : M.bg,
      })}
    >
      <View style={{ position: "absolute", left: 20, width: 24, alignItems: "center" }}>
        {busy ? <ActivityIndicator color={M.ink} size="small" /> : <FontAwesome name="google" size={20} color={M.ink} />}
      </View>
      <Text style={{ color: M.ink, fontSize: z.text, fontWeight: "600" }}>{busy ? "Signing in…" : label}</Text>
    </Pressable>
  );
}

function Terms() {
  const z = useSizes();
  return (
    <Text style={{ color: M.sub, fontSize: z.small, lineHeight: z.small + 6, textAlign: "center", paddingTop: 4 }}>
      By continuing, you agree to Dayora's{" "}
      <Text style={{ color: M.ink, fontWeight: "700", textDecorationLine: "underline" }}>Terms & Conditions</Text>
      {"\n"}and <Text style={{ color: M.ink, fontWeight: "700", textDecorationLine: "underline" }}>Privacy Policy</Text>
    </Text>
  );
}

function AuthInput({
  label,
  icon,
  error,
  password,
  right,
  ...rest
}: TextInputProps & { label: string; icon?: IconName; error?: string; password?: boolean; right?: React.ReactNode }) {
  const z = useSizes();
  const [focused, setFocused] = React.useState(false);
  const [show, setShow] = React.useState(false);
  const inputRef = React.useRef<React.ComponentRef<typeof TextInput>>(null);
  const borderColor = error ? M.error : focused ? M.ink : M.field;
  return (
    <View style={{ gap: z.labelGap }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: M.ink, fontSize: z.label, fontWeight: "600" }}>{label}</Text>
        {right}
      </View>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: z.field,
          paddingHorizontal: 18,
          gap: 12,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: focused ? M.bg : M.field,
        }}
      >
        {icon ? <Icon name={icon} size={18} color={focused ? M.ink : M.faint} /> : null}
        <TextInput
          ref={inputRef}
          placeholderTextColor={M.faint}
          selectionColor={M.ink}
          cursorColor={M.ink}
          secureTextEntry={password && !show}
          autoCapitalize={password ? "none" : rest.autoCapitalize}
          autoCorrect={password ? false : rest.autoCorrect}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={{ flex: 1, alignSelf: "stretch", color: M.ink, fontSize: z.fieldFont, paddingVertical: 0, paddingHorizontal: 0 }}
        />
        {password ? (
          <Pressable onPress={() => setShow(!show)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"}>
            <Icon name={show ? "eye-off" : "eye"} size={20} color={M.sub} />
          </Pressable>
        ) : null}
      </Pressable>
      {error ? <Text style={{ color: M.error, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

function PrimaryButton({ title, onPress, loading, outline }: { title: string; onPress: () => void; loading?: boolean; outline?: boolean }) {
  const z = useSizes();
  const fg = outline ? M.ink : M.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => ({
        height: z.button,
        borderRadius: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: outline ? M.bg : M.ink,
        borderWidth: outline ? 1.5 : 0,
        borderColor: M.ink,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: z.text, fontWeight: "800", letterSpacing: outline ? 0 : 1.5 }}>
          {outline ? title : title.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <View
      style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: M.ink }}
    >
      <Icon name="alert-circle" size={18} color={M.ink} />
      <Text style={{ flex: 1, color: M.ink, fontSize: 13, lineHeight: 18 }}>{message}</Text>
    </View>
  );
}

function FooterLink({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  const z = useSizes();
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 4 }}>
      <Text style={{ color: M.sub, fontSize: z.text }}>{text}</Text>
      <Pressable onPress={onPress} hitSlop={8}>
        <Text style={{ color: M.ink, fontSize: z.text, fontWeight: "800" }}>{link}</Text>
      </Pressable>
    </View>
  );
}

/** Hidden server switch (long-press the logo). Kept so a tester can point the app at another PC. */
function ServerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [url, setUrl] = React.useState(getServer());
  const [state, setState] = React.useState<"idle" | "testing" | "ok" | "fail">("idle");

  React.useEffect(() => {
    if (visible) {
      setUrl(getServer());
      setState("idle");
    }
  }, [visible]);

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
    <Sheet visible={visible} onClose={onClose} title="API server">
      <AuthInput
        label="Server URL"
        icon="server"
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          setState("idle");
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.10:8000"
      />
      <PrimaryButton title="Save & test" outline loading={state === "testing"} onPress={save} />
      {state === "ok" ? <Text style={{ color: M.ink, fontSize: 13 }}>Connected.</Text> : null}
      {state === "fail" ? <Text style={{ color: M.error, fontSize: 13 }}>Can't reach the server at that address.</Text> : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------- screens

export function LoginScreen({ navigation }: NativeStackScreenProps<AuthStack, "Login">) {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    const e: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email";
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
    <AuthLayout
      title="Welcome Back"
      subtitle="Please sign in to your account."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    >
      <AuthInput
        label="Email Address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="Enter email"
        error={errors.email}
        returnKeyType="next"
      />
      <AuthInput
        label="Password"
        password
        value={password}
        onChangeText={setPassword}
        placeholder="Enter password"
        error={errors.password}
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Pressable onPress={() => navigation.navigate("Forgot")} hitSlop={8} style={{ alignSelf: "flex-start" }}>
        <Text style={{ color: M.ink, fontSize: 15, fontWeight: "700" }}>Forgot Password?</Text>
      </Pressable>
      <FormError message={errors.form} />
      <PrimaryButton title="Sign in" onPress={submit} loading={loading} />
      <FooterLink text="Don't have an account?" link="Create account" onPress={() => navigation.navigate("Register")} />
      <OrDivider />
      <GoogleButton label="Sign in with Google" />
      <Terms />
    </AuthLayout>
  );
}

export function RegisterScreen({ navigation }: NativeStackScreenProps<AuthStack, "Register">) {
  const [form, setForm] = React.useState({ email: "", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);

  const pw = form.password;
  const checks = [
    { ok: pw.length >= 8, label: "8+ characters" },
    { ok: /[a-z]/i.test(pw), label: "A letter" },
    { ok: /\d/.test(pw), label: "A number" },
  ];

  async function submit() {
    const e: Record<string, string> = {};
    if (!EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email";
    if (!checks.every((c) => c.ok)) e.password = "Use at least 8 characters with letters and numbers";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      // Step 1: the API emails a 6-digit code; the account is created once it's confirmed.
      const res = await api<SignupStartOut>("/api/auth/signup/start", {
        method: "POST",
        json: { email: form.email.trim(), password: form.password },
      });
      navigation.navigate("Verify", { email: res.email, resendIn: res.resend_in, devCode: res.dev_code ?? undefined });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create Account"
      subtitle="Please fill in your details to get started."
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    >
      <AuthInput
        label="Email Address"
        value={form.email}
        onChangeText={(email) => setForm({ ...form, email })}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="Enter email"
        error={errors.email}
      />
      <View style={{ gap: 10 }}>
        <AuthInput
          label="Password"
          password
          value={form.password}
          onChangeText={(password) => setForm({ ...form, password })}
          placeholder="Create a password"
          autoComplete="new-password"
          error={errors.password}
          onSubmitEditing={submit}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
          {checks.map((c) => (
            <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.ok ? M.ink : "transparent",
                  borderWidth: c.ok ? 0 : 1.5,
                  borderColor: M.line,
                }}
              >
                {c.ok ? <Icon name="check" size={10} color={M.bg} /> : null}
              </View>
              <Text style={{ color: c.ok ? M.ink : M.faint, fontSize: 12, fontWeight: "600" }}>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <FormError message={errors.form} />
      <PrimaryButton title="Create account" onPress={submit} loading={loading} />
      <FooterLink
        text="Already have an account?"
        link="Sign in"
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace("Login"))}
      />
      <OrDivider />
      <GoogleButton label="Sign up with Google" />
      <Terms />
    </AuthLayout>
  );
}

const CODE_LENGTH = 6;

/** Six boxes backed by one invisible input, so typing, deleting and pasting all just work. */
function CodeBoxes({ value, onChange, error, autoFocus }: { value: string; onChange: (v: string) => void; error?: boolean; autoFocus?: boolean }) {
  const z = useSizes();
  const [focused, setFocused] = React.useState(false);
  const box = Math.min(52, z.field);
  return (
    <View style={{ height: box + 4, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const ch = value[i] ?? "";
          const active = focused && (i === value.length || (value.length === CODE_LENGTH && i === CODE_LENGTH - 1));
          return (
            <View
              key={i}
              style={{
                flex: 1,
                maxWidth: 56,
                height: box,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: error ? M.error : active ? M.ink : ch ? M.line : M.field,
                backgroundColor: ch || active ? M.bg : M.field,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: M.ink, fontSize: Math.round(box * 0.45), fontWeight: "800" }}>{ch}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        autoFocus={autoFocus}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel="Verification code"
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.011, color: "transparent" }}
      />
    </View>
  );
}

export function VerifyScreen({ navigation, route }: NativeStackScreenProps<AuthStack, "Verify">) {
  const { signIn } = useAuth();
  const { email, devCode: initialDevCode } = route.params;
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [devCode, setDevCode] = React.useState(initialDevCode);
  const [resendAt, setResendAt] = React.useState(() => Date.now() + (route.params.resendIn ?? 60) * 1000);
  const [now, setNow] = React.useState(Date.now());
  const submitted = React.useRef("");

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const verify = React.useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH) return setError("Enter the 6-digit code");
      setError("");
      setLoading(true);
      try {
        const res = await api<AuthOut>("/api/auth/signup/verify", { method: "POST", json: { email, code: value } });
        await signIn(res);
      } catch (err) {
        setError(errorMessage(err));
        setCode("");
        submitted.current = "";
      } finally {
        setLoading(false);
      }
    },
    [email, signIn],
  );

  function onChange(v: string) {
    setCode(v);
    if (error) setError("");
    // Submit automatically once all six digits are in (once per code).
    if (v.length === CODE_LENGTH && submitted.current !== v && !loading) {
      submitted.current = v;
      verify(v);
    }
  }

  async function resend() {
    if (wait || resending) return;
    setResending(true);
    try {
      const res = await api<SignupStartOut>("/api/auth/signup/resend", { method: "POST", json: { email } });
      setResendAt(Date.now() + res.resend_in * 1000);
      setDevCode(res.dev_code ?? undefined);
      setCode("");
      setError("");
      submitted.current = "";
      toast("A new code is on its way.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout title="Verify Your Email" subtitle={`Enter the 6-digit code we sent to\n${email}`} onBack={() => navigation.goBack()}>
      <CodeBoxes value={code} onChange={onChange} error={!!error} autoFocus />
      {error ? <Text style={{ color: M.error, fontSize: 13, textAlign: "center" }}>{error}</Text> : null}
      {devCode ? (
        <Pressable onPress={() => onChange(devCode)} hitSlop={6}>
          <Text style={{ color: M.sub, fontSize: 12, textAlign: "center" }}>
            Development server (no email set up): code <Text style={{ color: M.ink, fontWeight: "800" }}>{devCode}</Text> · tap to fill
          </Text>
        </Pressable>
      ) : null}
      <PrimaryButton title="Verify" onPress={() => verify(code)} loading={loading} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
        <Text style={{ color: M.sub, fontSize: 15 }}>Didn't get the code?</Text>
        {wait ? (
          <Text style={{ color: M.faint, fontSize: 15, fontWeight: "700" }}>
            Resend in {Math.floor(wait / 60)}:{String(wait % 60).padStart(2, "0")}
          </Text>
        ) : (
          <Pressable onPress={resend} hitSlop={8} disabled={resending}>
            <Text style={{ color: M.ink, fontSize: 15, fontWeight: "800" }}>{resending ? "Sending…" : "Resend"}</Text>
          </Pressable>
        )}
      </View>
      <FooterLink text="Wrong email?" link="Change it" onPress={() => navigation.goBack()} />
      <Text style={{ color: M.faint, fontSize: 12, textAlign: "center" }}>Can't find it? Check your Spam or Promotions folder.</Text>
    </AuthLayout>
  );
}

export function ForgotScreen({ navigation }: NativeStackScreenProps<AuthStack, "Forgot">) {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email");
    setError("");
    setLoading(true);
    try {
      const res = await api<{ message: string; dev_reset_code?: string }>("/api/auth/forgot-password", {
        method: "POST",
        json: { email: email.trim() },
      });
      navigation.navigate("Reset", { email: email.trim(), devCode: res.dev_reset_code });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="Enter your email and we'll send you a 6-digit code." onBack={() => navigation.goBack()}>
      <AuthInput
        label="Email Address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="Enter email"
        error={error}
        onSubmitEditing={submit}
      />
      <PrimaryButton title="Send code" onPress={submit} loading={loading} />
    </AuthLayout>
  );
}

export function ResetScreen({ navigation, route }: NativeStackScreenProps<AuthStack, "Reset">) {
  const { email, devCode } = route.params;
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [dev, setDev] = React.useState(devCode);

  async function submit() {
    const e: Record<string, string> = {};
    if (code.length !== CODE_LENGTH) e.code = "Enter the 6-digit code";
    if (password.length < 8) e.new_password = "At least 8 characters";
    else if (!/[a-z]/i.test(password) || !/\d/.test(password)) e.new_password = "Use letters and numbers";
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      await api("/api/auth/reset-password", { method: "POST", json: { email, code, new_password: password } });
      toast("Password updated. Please sign in.");
      navigation.navigate("Login");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setErrors({ code: errorMessage(err) });
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      const res = await api<{ dev_reset_code?: string }>("/api/auth/forgot-password", { method: "POST", json: { email } });
      setDev(res.dev_reset_code);
      setCode("");
      setErrors({});
      toast("A new code is on its way.");
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthLayout title="New Password" subtitle={`Enter the 6-digit code we sent to\n${email}`} onBack={() => navigation.goBack()}>
      <CodeBoxes value={code} onChange={(v) => setCode(v)} error={!!errors.code} autoFocus />
      {errors.code ? <Text style={{ color: M.error, fontSize: 13, textAlign: "center" }}>{errors.code}</Text> : null}
      {dev ? (
        <Pressable onPress={() => setCode(dev)} hitSlop={6}>
          <Text style={{ color: M.sub, fontSize: 12, textAlign: "center" }}>
            Development server (no email set up): code <Text style={{ color: M.ink, fontWeight: "800" }}>{dev}</Text> · tap to fill
          </Text>
        </Pressable>
      ) : null}
      <AuthInput
        label="New Password"
        password
        value={password}
        onChangeText={setPassword}
        error={errors.new_password}
        placeholder="8+ characters, letters & numbers"
        autoComplete="new-password"
        onSubmitEditing={submit}
      />
      <PrimaryButton title="Update password" onPress={submit} loading={loading} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}>
        <Text style={{ color: M.sub, fontSize: 15 }}>Didn't get the code?</Text>
        <Pressable onPress={resend} hitSlop={8} disabled={resending}>
          <Text style={{ color: M.ink, fontSize: 15, fontWeight: "800" }}>{resending ? "Sending…" : "Resend"}</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}
