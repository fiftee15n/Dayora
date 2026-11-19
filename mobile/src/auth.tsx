import * as React from "react";

import { api, loadSession, setToken, setUnauthorizedHandler } from "./api";
import { googleSignOut } from "./google";
import { cancelAllReminderNotifications } from "./notifications";
import { clearCache } from "./query";
import type { AuthOut, User } from "./types";

type AuthState = {
  ready: boolean;
  user: User | null;
  signIn: (res: AuthOut) => Promise<void>;
  signOut: (opts?: { everywhere?: boolean; skipServer?: boolean }) => Promise<void>;
  setUser: (u: User) => void;
  reload: () => Promise<void>;
};

const Ctx = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [user, setUser] = React.useState<User | null>(null);

  const reset = React.useCallback(async () => {
    await setToken(null);
    clearCache();
    setUser(null);
    cancelAllReminderNotifications().catch(() => {});
  }, []);

  const reload = React.useCallback(async () => {
    try {
      setUser(await api<User>("/api/auth/me"));
    } catch (e) {
      // Only sign out on a real 401; keep the session when the server is just unreachable.
      if ((e as { status?: number }).status === 401) await reset();
      else throw e;
    }
  }, [reset]);

  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      reset();
    });
    (async () => {
      const { token } = await loadSession();
      if (token) {
        try {
          await reload();
        } catch {
          // Offline / server down: let the app open; screens will show the error and retry.
          setUser({ id: 0, name: "", email: "", avatar_url: null, currency: "BDT", created_at: "" });
          reload().catch(() => {});
        }
      }
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [reload, reset]);

  const value = React.useMemo<AuthState>(
    () => ({
      ready,
      user,
      setUser,
      reload,
      async signIn(res) {
        await setToken(res.access_token);
        clearCache();
        setUser(res.user);
      },
      async signOut(opts) {
        if (!opts?.skipServer) {
          await api(opts?.everywhere ? "/api/auth/logout-all" : "/api/auth/logout", {
            method: "POST",
          }).catch(() => {});
        }
        await googleSignOut();
        await reset();
      },
    }),
    [ready, user, reload, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export function useUser(): User {
  const { user } = useAuth();
  return user!;
}
