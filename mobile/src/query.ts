import { useFocusEffect } from "@react-navigation/native";
import * as React from "react";

import { api } from "./api";

/**
 * A tiny SWR-style cache: data is kept per path, refreshed when a screen gains focus,
 * and `invalidate("/api/tasks", ...)` refetches every mounted query under those prefixes.
 */
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

export function invalidate(...prefixes: string[]) {
  for (const [key, subs] of listeners) {
    if (prefixes.some((p) => key.startsWith(p))) subs.forEach((fn) => fn());
  }
  for (const key of [...cache.keys()]) {
    if (prefixes.some((p) => key.startsWith(p)) && !listeners.has(key)) cache.delete(key);
  }
}

export function clearCache() {
  cache.clear();
}

export function setCached<T>(path: string, data: T) {
  cache.set(path, data);
}

export function useQuery<T>(path: string | null) {
  const [data, setData] = React.useState<T | undefined>(() =>
    path ? (cache.get(path) as T | undefined) : undefined,
  );
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const current = React.useRef(path);
  current.current = path;

  const load = React.useCallback(
    async (manual = false) => {
      if (!path) return;
      if (manual) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api<T>(path);
        cache.set(path, res);
        if (current.current === path) {
          setData(res);
          setError(null);
        }
      } catch (e) {
        if (current.current === path) setError(e as Error);
      } finally {
        if (current.current === path) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  // Path changed: show cached data for the new key immediately, then load.
  React.useEffect(() => {
    if (!path) return;
    setData(cache.get(path) as T | undefined);
    load();
    let subs = listeners.get(path);
    if (!subs) listeners.set(path, (subs = new Set()));
    const fn = () => load();
    subs.add(fn);
    return () => {
      subs!.delete(fn);
      if (!subs!.size) listeners.delete(path);
    };
  }, [path, load]);

  // Refresh when coming back to the screen.
  const first = React.useRef(true);
  useFocusEffect(
    React.useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      load();
    }, [load]),
  );

  return {
    data,
    error,
    loading: loading && data === undefined,
    refreshing,
    refresh: () => load(true),
    mutate: (next: T) => {
      if (path) cache.set(path, next);
      setData(next);
    },
  };
}
