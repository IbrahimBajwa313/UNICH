"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import type { AppUser, AuthMe } from "@/lib/types";

type AuthState = {
  loading: boolean;
  authenticated: boolean;
  user: AppUser | null;
  permissions: string[];
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const me = await api<AuthMe>("/api/auth/me");
      setAuthenticated(me.authenticated);
      setUser(me.user);
      setPermissions(me.permissions || []);
    } catch {
      setAuthenticated(false);
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setAuthenticated(false);
    setUser(null);
    setPermissions([]);
    window.location.href = "/login";
  }, []);

  const hasPermission = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions],
  );

  return (
    <AuthContext.Provider
      value={{
        loading,
        authenticated,
        user,
        permissions,
        refresh,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
