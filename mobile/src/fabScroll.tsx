import * as React from "react";
import { Animated, Easing, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

/* Hide the floating "+" button while the user scrolls down through a list (so it never sits
   on top of what they're reading), and bring it back when they scroll up or reach the top.
   Screen reports scrolling; Fab reads the shared animated value. Both must be inside the
   provider, which wraps every screen (see App.tsx / GlassTabBar). */

type FabScroll = { shown: Animated.Value; onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void };

const Ctx = React.createContext<FabScroll | null>(null);

export function FabScrollProvider({ children }: { children: React.ReactNode }) {
  const value = React.useMemo<FabScroll>(() => {
    const shown = new Animated.Value(1);
    let lastY = 0;
    let visible = true;
    const animate = (to: 0 | 1) => {
      if ((to === 1) === visible) return;
      visible = to === 1;
      Animated.timing(shown, { toValue: to, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    };
    return {
      shown,
      onScroll(e) {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const y = contentOffset.y;
        const dy = y - lastY;
        lastY = y;
        const atBottom = y + layoutMeasurement.height >= contentSize.height - 8;
        if (y < 40) animate(1); // near the top: always available
        else if (atBottom) animate(1); // the end has padding, so nothing is covered
        else if (dy > 6) animate(0); // scrolling down: get out of the way
        else if (dy < -6) animate(1); // scrolling up: user may want to add something
      },
    };
  }, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFabScroll() {
  return React.useContext(Ctx);
}
