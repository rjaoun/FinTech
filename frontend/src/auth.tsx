import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, saveToken, clearToken, formatApiErrorDetail, setUnauthorizedHandler } from "./api";

export type User = {
  id: string;
  email: string;
  name: string;
  currency: string;
  role: string;
  created_at: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Register global 401 handler so any expired/missing-token response quietly
  // logs the user out; RootGate then redirects to /(auth)/login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      await saveToken(res.data.access_token);
      setUser(res.data.user);
    } catch (e: any) {
      throw new Error(formatApiErrorDetail(e?.response?.data?.detail) || e?.message || "Login failed");
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      const res = await api.post("/auth/register", { email, password, name });
      await saveToken(res.data.access_token);
      setUser(res.data.user);
    } catch (e: any) {
      throw new Error(formatApiErrorDetail(e?.response?.data?.detail) || e?.message || "Registration failed");
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
