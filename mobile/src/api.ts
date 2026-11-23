import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "dayora_token";
const SERVER_KEY = "dayora_server";

const extra = (Constants.expoConfig?.extra ?? {}) as { defaultApiUrl?: string; devApiUrl?: string };

/** Debug builds (development, __DEV__) use the backend on your PC; release builds the hosted API. */
export const DEFAULT_SERVER: string =
  (__DEV__ && extra.devApiUrl) || extra.defaultApiUrl || "http://10.0.2.2:8000";

let token: string | null = null;
let server = DEFAULT_SERVER;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function loadSession() {
  const [t, s] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(SERVER_KEY),
  ]);
  token = t;
  // Release builds always use the hosted API, on any network: a saved address is ignored and
  // removed. Only debug builds can be pointed at another server.
  if (s && __DEV__) server = s;
  else if (s) await SecureStore.deleteItemAsync(SERVER_KEY);
  return { token, server };
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function normalizeServer(url: string) {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export async function setServer(url: string) {
  if (!__DEV__) return;
  server = normalizeServer(url) || DEFAULT_SERVER;
  await SecureStore.setItemAsync(SERVER_KEY, server);
}

export const getServer = () => server;
export const getToken = () => token;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** Absolute URL for a backend-relative path like /uploads/avatars/x.png. */
export function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  return /^https?:/i.test(path) ? path : `${server}${path}`;
}

type Init = { method?: string; json?: unknown; body?: FormData; timeoutMs?: number };

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-TZ-Offset": String(-new Date().getTimezoneOffset()),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: string | FormData | undefined = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30000);
  let res: Response;
  try {
    res = await fetch(`${server}${path}`, {
      method: init.method ?? "GET",
      headers,
      body,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(
      0,
      __DEV__
        ? `Can't reach the server at ${server}. Check that the API is running and the phone is on the same network.`
        : "Can't reach Dayora. Check your internet connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/register")) {
    onUnauthorized?.();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    const fields: Record<string, string> = {};
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) {
        for (const err of data.detail) {
          const field = err.loc?.[err.loc.length - 1];
          const msg = String(err.msg ?? "Invalid value").replace(/^Value error, /, "");
          if (field) fields[field] = msg;
        }
        message = Object.values(fields)[0] ?? "Please check the form and try again.";
      }
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, message, fields);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all")
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}
