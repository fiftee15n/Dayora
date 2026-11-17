"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";

import { fetcher } from "@/lib/api";

type Theme = "light" | "dark" | "system";
const ThemeCtx = React.createContext<{ theme: Theme; resolved: "light" | "dark"; setTheme: (t: Theme) => void }>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});
export const useTheme = () => React.useContext(ThemeCtx);

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("dayora-theme");
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  React.useEffect(() => setThemeState(readTheme()), []);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const r = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.classList.toggle("dark", r === "dark");
      setResolved(r);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("dayora-theme", t);
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeCtx.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SWRConfig value={{ fetcher, revalidateOnFocus: true, keepPreviousData: true }}>
        {children}
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: "!rounded-xl" }} />
      </SWRConfig>
    </ThemeProvider>
  );
}

/** Inline script that applies the saved theme before first paint (avoids a flash). */
export const themeScript = `(function(){try{var t=localStorage.getItem('dayora-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`;
