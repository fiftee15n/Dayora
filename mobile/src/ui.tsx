import Feather from "@expo/vector-icons/Feather";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { LinearGradient } from "expo-linear-gradient";
import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { mediaUrl } from "./api";
import { BRAND, radius, useColors } from "./theme";
import { alpha, initials } from "./utils";

export type IconName = React.ComponentProps<typeof Feather>["name"];

export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  return <Feather name={name} size={size} color={color ?? c.foreground} style={style} />;
}

export function toast(message: string) {
  if (Platform.OS === "android") ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}

export function errorMessage(e: unknown, fallback = "Something went wrong") {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function confirm(title: string, message: string, action = "Delete", destructive = true) {
  return new Promise<boolean>((resolve) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}

// ---------- Text ----------
type TProps = React.ComponentProps<typeof Text> & {
  variant?: "title" | "h2" | "h3" | "body" | "small" | "caption" | "label";
  muted?: boolean;
  color?: string;
  weight?: TextStyle["fontWeight"];
};

export function T({ variant = "body", muted, color, weight, style, ...rest }: TProps) {
  const c = useColors();
  const base: Record<NonNullable<TProps["variant"]>, TextStyle> = {
    title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
    h2: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
    h3: { fontSize: 16, fontWeight: "700" },
    body: { fontSize: 15 },
    small: { fontSize: 13 },
    caption: { fontSize: 12 },
    label: { fontSize: 13, fontWeight: "600" },
  };
  return (
    <Text
      {...rest}
      style={[base[variant], { color: color ?? (muted ? c.mutedForeground : c.foreground) }, weight ? { fontWeight: weight } : null, style]}
    />
  );
}

// ---------- Layout ----------
export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
  footer,
  back,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
  footer?: React.ReactNode;
  back?: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      {back && (
        <Pressable onPress={back} hitSlop={12} style={{ marginRight: 8 }}>
          <Icon name="arrow-left" size={24} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <T variant="title" numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="small" muted numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  ) : (
    <View style={{ height: insets.top }} />
  );
  const pad = padded ? { paddingHorizontal: 16 } : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: 110, gap: 14 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.primary} colors={[c.primary]} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useColors();
  const s = [styles.card, { backgroundColor: c.card, borderColor: c.border }, style];
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={s}>{children}</View>;
}

export function CardHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={styles.rowBetween}>
      <T variant="h3">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <T variant="label" color={c.primary}>{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({ children, gap = 8, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

// ---------- Buttons ----------
type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.primary, fg: c.primaryForeground },
    secondary: { bg: c.primarySoft, fg: c.primary },
    outline: { bg: "transparent", fg: c.foreground, border: c.border },
    ghost: { bg: "transparent", fg: c.foreground },
    danger: { bg: c.danger, fg: "#fff" },
  };
  const p = palette[variant];
  const content = (
    <>
      {loading ? <ActivityIndicator color={p.fg} size="small" /> : icon ? <Icon name={icon} size={small ? 15 : 17} color={p.fg} /> : null}
      <Text style={{ color: p.fg, fontWeight: "700", fontSize: small ? 13 : 15 }}>{title}</Text>
    </>
  );
  const inner: ViewStyle = { ...styles.btn, height: small ? 36 : 48, paddingHorizontal: small ? 12 : 18 };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{ borderRadius: 12, overflow: "hidden", opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {variant === "primary" ? (
        <LinearGradient colors={BRAND} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={inner}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[inner, { backgroundColor: p.bg, borderWidth: p.border ? 1 : 0, borderColor: p.border, borderRadius: 12 }]}>{content}</View>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, color, bg, size = 20, label }: { name: IconName; onPress?: () => void; color?: string; bg?: string; size?: number; label?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg ?? c.muted, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={name} size={size} color={color ?? c.foreground} />
    </Pressable>
  );
}

export function Fab({ onPress, icon = "plus" }: { onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]} accessibilityLabel="Add">
      <LinearGradient colors={BRAND} style={styles.fabInner}>
        <Icon name={icon} size={26} color="#fff" />
      </LinearGradient>
    </Pressable>
  );
}

// ---------- Inputs ----------
export function Field({ label, error, children, hint }: { label?: string; error?: string; children: React.ReactNode; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label">{label}</T> : null}
      {children}
      {error ? <T variant="caption" color={c.danger}>{error}</T> : hint ? <T variant="caption" muted>{hint}</T> : null}
    </View>
  );
}

export function Input({ label, error, hint, right, style, multiline, ...rest }: TextInputProps & { label?: string; error?: string; hint?: string; right?: React.ReactNode }) {
  const c = useColors();
  const [focused, setFocused] = React.useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      <View
        style={[
          styles.input,
          { backgroundColor: c.card, borderColor: error ? c.danger : focused ? c.primary : c.input },
          multiline && { height: undefined, minHeight: 110, alignItems: "flex-start", paddingVertical: 10 },
        ]}
      >
        <TextInput
          placeholderTextColor={c.mutedForeground}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[{ flex: 1, color: c.foreground, fontSize: 15 }, multiline && { minHeight: 90 }, style]}
          {...rest}
        />
        {right}
      </View>
    </Field>
  );
}

export function PasswordInput(props: TextInputProps & { label?: string; error?: string; hint?: string }) {
  const [show, setShow] = React.useState(false);
  const c = useColors();
  return (
    <Input
      {...props}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      right={
        <Pressable onPress={() => setShow(!show)} hitSlop={10}>
          <Icon name={show ? "eye-off" : "eye"} size={18} color={c.mutedForeground} />
        </Pressable>
      }
    />
  );
}

export function Chips<V extends string | number | null>({
  options,
  value,
  onChange,
  scroll = true,
}: {
  options: { value: V; label: string; color?: string }[];
  value: V;
  onChange: (v: V) => void;
  scroll?: boolean;
}) {
  const c = useColors();
  const items = options.map((o) => {
    const active = o.value === value;
    return (
      <Pressable
        key={String(o.value)}
        onPress={() => onChange(o.value)}
        style={[
          styles.chip,
          { borderColor: active ? o.color ?? c.primary : c.border, backgroundColor: active ? alpha(o.color ?? c.primary, 0.14) : c.card },
        ]}
      >
        {o.color ? <View style={[styles.dot, { backgroundColor: o.color }]} /> : null}
        <Text style={{ color: active ? o.color ?? c.primary : c.foreground, fontWeight: active ? "700" : "500", fontSize: 13 }}>{o.label}</Text>
      </Pressable>
    );
  });
  if (!scroll) return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{items}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} keyboardShouldPersistTaps="handled">
      {items}
    </ScrollView>
  );
}

export function Segmented<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.muted }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, active && { backgroundColor: c.card, elevation: 1 }]}>
            <Text style={{ color: active ? c.foreground : c.mutedForeground, fontWeight: active ? "700" : "500", fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Checkbox({ checked, onPress, color }: { checked: boolean; onPress: () => void; color?: string }) {
  const c = useColors();
  const col = color ?? c.primary;
  return (
    <Pressable onPress={onPress} hitSlop={10} style={[styles.checkbox, { borderColor: checked ? col : c.input, backgroundColor: checked ? col : "transparent" }]}>
      {checked ? <Icon name="check" size={15} color="#fff" /> : null}
    </Pressable>
  );
}

function openAndroidPicker(value: Date, mode: "date" | "time", onPick: (d: Date) => void) {
  DateTimePickerAndroid.open({
    value,
    mode,
    is24Hour: false,
    onChange: (event, d) => {
      if (event.type === "set" && d) onPick(d);
    },
  });
}

/** Date (and optionally time) picker. `value` null = not set. */
export function DateField({
  label,
  value,
  onChange,
  withTime = false,
  clearable = false,
  error,
}: {
  label?: string;
  value: Date | null;
  onChange: (d: Date | null) => void;
  withTime?: boolean;
  clearable?: boolean;
  error?: string;
}) {
  const c = useColors();
  const [iosMode, setIosMode] = React.useState<null | "date" | "time">(null);
  const base = value ?? new Date();

  const pickDate = () => {
    if (Platform.OS !== "android") return setIosMode("date");
    openAndroidPicker(base, "date", (d) => {
      const next = new Date(base);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      if (!value && withTime) next.setHours(9, 0, 0, 0);
      onChange(next);
    });
  };
  const pickTime = () => {
    if (Platform.OS !== "android") return setIosMode("time");
    openAndroidPicker(base, "time", (d) => {
      const next = new Date(base);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      onChange(next);
    });
  };

  return (
    <Field label={label} error={error}>
      <Row gap={8}>
        <Pressable onPress={pickDate} style={[styles.input, { flex: 1, backgroundColor: c.card, borderColor: c.input }]}>
          <Icon name="calendar" size={16} color={c.mutedForeground} />
          <T style={{ flex: 1 }} muted={!value}>{value ? format(value, "EEE, MMM d, yyyy") : "No date"}</T>
        </Pressable>
        {withTime && value ? (
          <Pressable onPress={pickTime} style={[styles.input, { backgroundColor: c.card, borderColor: c.input }]}>
            <Icon name="clock" size={16} color={c.mutedForeground} />
            <T>{format(value, "h:mm a")}</T>
          </Pressable>
        ) : null}
        {clearable && value ? <IconButton name="x" onPress={() => onChange(null)} label="Clear date" /> : null}
      </Row>
      {iosMode ? (
        <DateTimePicker
          value={base}
          mode={iosMode}
          display="spinner"
          onChange={(_, d) => {
            setIosMode(null);
            if (d) onChange(d);
          }}
        />
      ) : null}
    </Field>
  );
}

// ---------- Display ----------
export function Badge({ label, color, icon }: { label: string; color?: string; icon?: IconName }) {
  const c = useColors();
  const col = color ?? c.primary;
  return (
    <View style={[styles.badge, { backgroundColor: alpha(col, 0.14) }]}>
      {icon ? <Icon name={icon} size={11} color={col} /> : null}
      <Text style={{ color: col, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export function Progress({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const c = useColors();
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.muted, overflow: "hidden" }}>
      <View style={{ width: `${v}%`, height, borderRadius: height, backgroundColor: color ?? c.primary }} />
    </View>
  );
}

export function Avatar({ name, url, size = 44 }: { name: string; url: string | null | undefined; size?: number }) {
  const src = mediaUrl(url);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (src && !failed)
    return <Image source={{ uri: src }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  return (
    <LinearGradient colors={BRAND} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.36 }}>{initials(name || "?")}</Text>
    </LinearGradient>
  );
}

export function IconTile({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: alpha(color, 0.15), alignItems: "center", justifyContent: "center" }}>
      <Icon name={name} size={size * 0.48} color={color} />
    </View>
  );
}

export function Stat({ label, value, icon, color, sub }: { label: string; value: string; icon: IconName; color: string; sub?: string }) {
  return (
    <Card style={{ flex: 1, gap: 10, padding: 14 }}>
      <IconTile name={icon} color={color} size={34} />
      <View>
        <T variant="h2" numberOfLines={1} adjustsFontSizeToFit>{value}</T>
        <T variant="caption" muted numberOfLines={1}>{label}</T>
        {sub ? <T variant="caption" muted numberOfLines={1}>{sub}</T> : null}
      </View>
    </Card>
  );
}

export function Empty({ icon, title, text, action, onAction }: { icon: IconName; title: string; text?: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={26} color={c.primary} />
      </View>
      <T variant="h3">{title}</T>
      {text ? <T variant="small" muted style={{ textAlign: "center", maxWidth: 280 }}>{text}</T> : null}
      {action ? <Button title={action} onPress={onAction} small variant="secondary" icon="plus" style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ paddingVertical: 48, alignItems: "center" }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const c = useColors();
  return (
    <Card style={{ borderColor: alpha(c.danger, 0.4), backgroundColor: c.dangerSoft, gap: 10 }}>
      <Row>
        <Icon name="wifi-off" color={c.danger} />
        <T variant="label" color={c.danger} style={{ flex: 1 }}>Couldn't load</T>
      </Row>
      <T variant="small">{error.message}</T>
      {onRetry ? <Button title="Try again" small variant="outline" icon="refresh-cw" onPress={onRetry} /> : null}
    </Card>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

// ---------- Sheet (modal form) ----------
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.background, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: c.input }]} />
          <View style={[styles.rowBetween, { paddingHorizontal: 18, paddingBottom: 8 }]}>
            <T variant="h2">{title}</T>
            <IconButton name="x" onPress={onClose} label="Close" />
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 6, gap: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: 18, paddingTop: 8 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  card: { borderRadius: radius + 4, borderWidth: 1, padding: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 18, bottom: 22, borderRadius: 20, elevation: 6, shadowColor: "#6366F1", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  fabInner: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, borderWidth: 1.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: { maxHeight: "90%", borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8 },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: 10 },
});
