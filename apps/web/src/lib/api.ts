import type { ApiErrorPayload } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const API_PREFIX = "/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${API_PREFIX}${safePath}`;
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

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
    cache: "no-store",
  });

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
