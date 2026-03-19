import React from "react";
import type { AuthUser, LoginResponse } from "@/lib/api";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  setAuth: (resp: LoginResponse) => void;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function readAuthFromStorage(): AuthState {
  const token = localStorage.getItem("token");
  const userRaw = localStorage.getItem("user");
  const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : null;
  return { token, user };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(() => readAuthFromStorage());

  const setAuth = React.useCallback((resp: LoginResponse) => {
    localStorage.setItem("token", resp.token);
    localStorage.setItem("user", JSON.stringify(resp.user));
    setState({ token: resp.token, user: resp.user });
  }, []);

  const logout = React.useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState({ token: null, user: null });
  }, []);

  const value: AuthContextValue = { ...state, setAuth, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

import React from "react";
import type { AuthUser, LoginResponse } from "@/lib/api";

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  setAuth: (resp: LoginResponse) => void;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

function readAuthFromStorage(): AuthState {
  const token = localStorage.getItem("token");
  const userRaw = localStorage.getItem("user");
  const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : null;
  return { token, user };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(() => readAuthFromStorage());

  const setAuth = React.useCallback((resp: LoginResponse) => {
    localStorage.setItem("token", resp.token);
    localStorage.setItem("user", JSON.stringify(resp.user));
    setState({ token: resp.token, user: resp.user });
  }, []);

  const logout = React.useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setState({ token: null, user: null });
  }, []);

  const value: AuthContextValue = { ...state, setAuth, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

