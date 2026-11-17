import { mutate } from "swr";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Init = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit };

function tzOffset(): string {
  return String(-new Date().getTimezoneOffset());
}

let redirecting = false;

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-TZ-Offset", tzOffset());
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  const res = await fetch(path, { ...init, headers, body, credentials: "include", cache: "no-store" });

  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/")) {
    if (!redirecting) {
      redirecting = true;
      // Clear a stale cookie first so the middleware doesn't bounce us back.
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
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
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, fields);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const fetcher = <T,>(url: string) => api<T>(url);

/** Revalidate every SWR key that starts with one of the given prefixes. */
export function revalidate(...prefixes: string[]) {
  return mutate(
    (key) => typeof key === "string" && prefixes.some((p) => key.startsWith(p)),
    undefined,
    { revalidate: true },
  );
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== "all") s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}
