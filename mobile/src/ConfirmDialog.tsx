import * as React from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Glyph, type GlyphName } from "./icons";
import { useColors, useIsDark } from "./theme";

/* The app's own confirmation dialog (replaces Android's grey Alert). `confirm()` in ui.tsx
   sends requests here; <ConfirmHost /> is mounted once at the root of the app. */

export type ConfirmRequest = {
  title: string;
  message: string;
  action: string;
  destructive: boolean;
  icon?: GlyphName;
  resolve: (ok: boolean) => void;
};

let show: ((r: ConfirmRequest) => void) | null = null;

/** Returns false when no host is mounted (callers fall back to the system dialog). */
export function requestConfirm(r: ConfirmRequest) {
  if (!show) return false;
  show(r);
  return true;
}

export function ConfirmHost() {
  const c = useColors();
  const dark = useIsDark();
  const [req, setReq] = React.useState<ConfirmRequest | null>(null);
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    show = (r) => {
      setReq((prev) => {
        prev?.resolve(false); // a newer request replaces an unanswered one
        return r;
      });
    };
    return () => {
      show = null;
    };
  }, []);

  React.useEffect(() => {
    if (req) {
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [req, anim]);

  function finish(ok: boolean) {
    if (!req) return;
    const r = req;
    Animated.timing(anim, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => {
      setReq(null);
      r.resolve(ok);
    });
  }

  const icon: GlyphName = req?.icon ?? (req?.destructive ? "trash" : "question");
  const actionBg = req?.destructive ? c.danger : c.foreground;
  const actionFg = req?.destructive ? "#FFFFFF" : c.background;

  return (
    <Modal visible={!!req} transparent animationType="none" statusBarTranslucent onRequestClose={() => finish(false)}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0,0,0,0.7)" : "rgba(10,10,10,0.45)", opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => finish(false)} accessibilityLabel="Cancel" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              opacity: anim,
              transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}
        >
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: req?.destructive ? c.dangerSoft : c.muted,
            }}
          >
            <Glyph name={icon} size={26} color={req?.destructive ? c.danger : c.foreground} weight="bold" />
          </View>

          <Text style={{ color: c.foreground, fontSize: 20, fontWeight: "800", letterSpacing: -0.4, marginTop: 18 }}>{req?.title}</Text>
          {req?.message ? <Text style={{ color: c.mutedForeground, fontSize: 15, lineHeight: 22, marginTop: 6 }}>{req.message}</Text> : null}

          <View style={{ gap: 10, marginTop: 24 }}>
            <Pressable
              onPress={() => finish(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, { backgroundColor: actionBg, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ color: actionFg, fontSize: 16, fontWeight: "800" }}>{req?.action}</Text>
            </Pressable>
            <Pressable
              onPress={() => finish(false)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, { borderWidth: 1.5, borderColor: c.border, backgroundColor: pressed ? c.muted : "transparent" }]}
            >
              <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 28, borderWidth: 1, padding: 24 },
  button: { height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
