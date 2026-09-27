'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
    setUser(null);
    router.replace('/login');
  }, [router]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    const stored = getToken();
    if (!stored) {
      setLoading(false);
      return;
    }
    setTok(stored);
    api
      .me()
      .then(setUser)
      .catch(() => {
        setToken(null);
        setTok(null);
      })
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.accessToken);
    setTok(res.accessToken);
    setUser(res.user);
  }, []);

  const value = useMemo(() => ({ user, token, loading, login, logout }), [user, token, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Redirects to /login when signed out; optionally restricts to some roles. */
export function useRequireAuth(roles?: Role[]) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = !!auth.user && (!roles || roles.includes(auth.user.role));

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!allowed) router.replace('/board');
  }, [auth.loading, auth.user, allowed, router, pathname]);

  return { ...auth, ready: !auth.loading && allowed };
}
