"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiRequest, authHeaders, ApiError } from "@/lib/api";
import type { AuthResponse, AuthTokens, AuthUser } from "@/lib/types";

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload extends LoginPayload {
  firstName?: string;
  lastName?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  loading: boolean;
  error: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  authorizedRequest: <T>(path: string, init?: RequestInit) => Promise<T>;
  refreshProfile: () => Promise<void>;
}

const STORAGE_KEY = "arcto-crm-auth";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getPersistedAuth() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokensRef = useRef<AuthTokens | null>(null);

  const persistAuth = useCallback((payload: AuthResponse) => {
    setUser(payload.user);
    setTokens(payload.tokens);
    tokensRef.current = payload.tokens;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setTokens(null);
    tokensRef.current = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const handleAuthResponse = useCallback(
    (payload: AuthResponse) => {
      setError(null);
      persistAuth(payload);
    },
    [persistAuth],
  );

  const refreshTokens = useCallback(async () => {
    const refreshToken = tokensRef.current?.refreshToken;
    if (!refreshToken) {
      throw new Error("Kein Refresh Token gefunden");
    }

    const response = await apiRequest<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });

    handleAuthResponse(response);
    return response.tokens.accessToken;
  }, [handleAuthResponse]);

  const fetchProfile = useCallback(
    async (accessToken?: string) => {
      if (!accessToken) {
        setLoading(false);
        return;
      }

      const loadProfile = async (token: string) => {
        const profile = await apiRequest<AuthUser>("/auth/me", {
          headers: authHeaders(token),
        });
        setUser(profile);
      };

      try {
        await loadProfile(accessToken);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            const nextAccessToken = await refreshTokens();
            await loadProfile(nextAccessToken);
            return;
          } catch (refreshErr) {
            console.error(refreshErr);
          }
        }

        console.error(err);
        logout();
      } finally {
        setLoading(false);
      }
    },
    [logout, refreshTokens],
  );

  useEffect(() => {
    const existing = getPersistedAuth();
    if (!existing) {
      setLoading(false);
      return;
    }

    setUser(existing.user);
    setTokens(existing.tokens);
    tokensRef.current = existing.tokens;
    void fetchProfile(existing.tokens.accessToken);
  }, [fetchProfile]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setError(null);
      try {
        const response = await apiRequest<AuthResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        handleAuthResponse(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Login fehlgeschlagen";
        setError(message);
        throw err;
      }
    },
    [handleAuthResponse],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setError(null);
      try {
        const response = await apiRequest<AuthResponse>("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        handleAuthResponse(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registrierung fehlgeschlagen";
        setError(message);
        throw err;
      }
    },
    [handleAuthResponse],
  );

  const authorizedRequest = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      if (!tokens?.accessToken) {
        throw new Error("Nicht eingeloggt");
      }

      try {
        return await apiRequest<T>(path, {
          ...init,
          headers: authHeaders(tokens.accessToken, init.headers),
        });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          const nextAccessToken = await refreshTokens();
          return apiRequest<T>(path, {
            ...init,
            headers: authHeaders(nextAccessToken, init.headers),
          });
        }

        throw err;
      }
    },
    [refreshTokens, tokens?.accessToken],
  );

  const refreshProfile = useCallback(async () => {
    if (!tokens?.accessToken) {
      return;
    }
    await fetchProfile(tokens.accessToken);
  }, [fetchProfile, tokens?.accessToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tokens,
      loading,
      error,
      login,
      register,
      logout,
      authorizedRequest,
      refreshProfile,
    }),
    [authorizedRequest, error, loading, login, logout, refreshProfile, register, tokens, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth muss innerhalb des AuthProvider verwendet werden");
  }
  return context;
}
