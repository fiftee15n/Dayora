import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { requireOptionalNativeModule } from "expo";
import * as React from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FabScrollProvider } from "./fabScroll";
import { Glyph, type GlyphName } from "./icons";
import { useColors, useIsDark } from "./theme";

/* Floating "glass" tab bar: a rounded pill that hovers above the content and blurs whatever
   scrolls underneath it. On Android the blur needs the content wrapped in a BlurTargetView
   (see BlurTargetLayout), and the BlurView must live outside that target. */

export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_GAP = 12;

// The blur needs native code from expo-blur. Older APKs built before it was added don't have it,
// so load it lazily and fall back to a frosted translucent fill.
const HAS_BLUR = !!requireOptionalNativeModule("ExpoBlur");
type BlurModule = typeof import("expo-blur");
const blur: BlurModule | null = HAS_BLUR ? require("expo-blur") : null;

type TargetRef = React.RefObject<React.ComponentRef<typeof View> | null>;

/** Per-screen blur targets, so the bar blurs whichever tab is showing. */
const TargetsContext = React.createContext<Map<string, TargetRef> | null>(null);

/** True inside tab screens: FABs and scroll padding make room for the floating bar. */
export const FloatingTabBarContext = React.createContext(false);

export function useFloatingTabBarSpace() {
  const inTabs = React.useContext(FloatingTabBarContext);
  const insets = useSafeAreaInsets();
  return inTabs ? insets.bottom + TAB_BAR_GAP + TAB_BAR_HEIGHT : 0;
}

export function BlurTargetsProvider({ children }: { children: React.ReactNode }) {
  const map = React.useRef(new Map<string, TargetRef>()).current;
  return <TargetsContext.Provider value={map}>{children}</TargetsContext.Provider>;
}

function useTargetRef(key: string): TargetRef {
  const map = React.useContext(TargetsContext)!;
  let ref = map.get(key);
  if (!ref) {
    ref = React.createRef<React.ComponentRef<typeof View>>();
    map.set(key, ref);
  }
  return ref;
}

/** `screenLayout` for the tab navigator: wraps each tab screen so it can be blurred. */
export function BlurTargetLayout({ routeKey, children }: { routeKey: string; children: React.ReactNode }) {
  const ref = useTargetRef(routeKey);
  const content = (
    <FloatingTabBarContext.Provider value>
      <FabScrollProvider>{children}</FabScrollProvider>
    </FloatingTabBarContext.Provider>
  );
  if (!blur || Platform.OS !== "android") return content;
  const Target = blur.BlurTargetView;
  return (
    <Target ref={ref} style={{ flex: 1 }}>
      {content}
    </Target>
  );
}

export function GlassTabBar({ state, descriptors, navigation, icons }: BottomTabBarProps & { icons: Record<string, GlyphName> }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const dark = useIsDark();
  const focusedKey = state.routes[state.index].key;
  const target = useTargetRef(focusedKey);
  const [keyboard, setKeyboard] = React.useState(false);

  React.useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboard) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_GAP }]}>
      <View style={styles.shadow}>
        <View style={[styles.pill, dark && { borderColor: "rgba(255,255,255,0.09)" }]}>
          {blur ? (
            <blur.BlurView
              // Remount when the tab changes so it blurs the newly visible screen.
              key={focusedKey}
              blurTarget={target}
              blurMethod="dimezisBlurViewSdk31Plus"
              intensity={70}
              tint={dark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
          {/* Milky glass layer + a bright top edge, like light catching the rim. */}
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: dark ? (blur ? "rgba(20,20,20,0.55)" : "rgba(20,20,20,0.95)") : blur ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.94)" },
            ]}
          />
          <View style={[styles.rim, dark && { backgroundColor: "rgba(255,255,255,0.14)" }]} />

          <View style={styles.row}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const { options } = descriptors[route.key];
              const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : (options.title ?? route.name);
              const onPress = () => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              };
              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={label}
                  style={styles.item}
                >
                  {({ pressed }) => (
                    <>
                      <View
                        style={[
                          styles.iconWrap,
                          focused && { backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(10,10,10,0.08)" },
                          pressed && { transform: [{ scale: 0.92 }] },
                        ]}
                      >
                        <Glyph name={icons[route.name]} size={24} color={c.foreground} weight={focused ? "fill" : "bold"} />
                      </View>
                      <Text style={[styles.label, { color: focused ? c.foreground : c.mutedForeground }, focused && styles.labelActive]} numberOfLines={1}>
                        {label}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const R = TAB_BAR_HEIGHT / 2;

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "stretch" },
  shadow: {
    borderRadius: R,
    backgroundColor: "rgba(255,255,255,0.01)",
    elevation: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  pill: {
    height: TAB_BAR_HEIGHT,
    borderRadius: R,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(10,10,10,0.07)",
  },
  rim: { position: "absolute", top: 0, left: R / 2, right: R / 2, height: 1, backgroundColor: "rgba(255,255,255,0.95)" },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  iconWrap: { width: 42, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10.5, fontWeight: "600", letterSpacing: 0.1 },
  labelActive: { fontWeight: "800" },
});
