import type { ApiErrorPayload } from "./types";

const API_PREFIX = "/api/v1";

const normalizeBase = (value?: string | null) => {
  if (!value) {
    return "";
  }
  return value.trim().replace(/\/$/, "");
};

const API_BASE = normalizeBase(process.env.NEXT_PUBLIC_API_URL);
const proxyFallback =
  process.env.NEXT_PUBLIC_API_PROXY ??
  process.env.API_PROXY_TARGET ??
  process.env.API_INTERNAL_URL ??
  (API_BASE || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000"));
const PROXY_BASE = normalizeBase(proxyFallback);
const SERVER_API_BASE = API_BASE || PROXY_BASE;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function ensureServerBase(): string {
  if (SERVER_API_BASE) {
    return SERVER_API_BASE;
  }
  throw new Error(
    "Es wurde keine API-Basis-URL konfiguriert. Setze NEXT_PUBLIC_API_URL oder NEXT_PUBLIC_API_PROXY.",
  );
}

function resolveBrowserBase(): string | null {
  if (!API_BASE) {
    return null;
  }
  if (typeof window === "undefined") {
    return API_BASE;
  }
  try {
    const apiUrl = new URL(API_BASE);
    if (apiUrl.protocol === "https:") {
      return API_BASE;
    }
    if (window.location.protocol !== "https:") {
      return API_BASE;
    }
    return null;
  } catch {
    return null;
  }
}

function buildUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const base =
    typeof window === "undefined" ? ensureServerBase() : resolveBrowserBase();
  if (!base) {
    return `${API_PREFIX}${safePath}`;
  }
  return `${base}${API_PREFIX}${safePath}`;
}

function buildHeaders(headers?: HeadersInit) {
  const next = new Headers(headers ?? {});
  next.set("Accept", "application/json");
  return next;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = buildHeaders(options.headers);
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  if (options.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
      cache: "no-store",
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `API-Verbindung fehlgeschlagen: ${err.message}`
        : "API-Verbindung fehlgeschlagen.";
    throw new ApiError(0, message);
  }

  if (!response.ok) {
    let message = "API Fehler";
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      message = payload.message ?? payload.error ?? message;
    } catch {
      // ignore
    }

    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export function authHeaders(token: string, headers?: HeadersInit) {
  const merged = buildHeaders(headers);
  merged.set("Authorization", `Bearer ${token}`);
  return merged;
}
