import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { AuthState } from '../../shared/types';
import { apiRequest, jsonBody } from '../lib/api';

interface SetupInput {
  setupToken: string;
  password: string;
  displayName: string;
  startDate: string;
  hasBands: boolean;
}

interface AuthContextValue {
  state: AuthState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setup: (input: SetupInput) => Promise<void>;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setState(await apiRequest<AuthState>('/api/auth/status'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось связаться с сервером');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const handleExpired = () => { void refresh(); };
    window.addEventListener('trenyrovka:auth-expired', handleExpired);
    return () => window.removeEventListener('trenyrovka:auth-expired', handleExpired);
  }, [refresh]);

  const setup = useCallback(async (input: SetupInput) => {
    const response = await apiRequest<{ authenticated: true; csrfToken: string }>('/api/auth/setup', {
      method: 'POST',
      body: jsonBody(input),
    });
    setState({ setupRequired: false, authenticated: true, csrfToken: response.csrfToken, timezone: 'Europe/Oslo' });
  }, []);

  const login = useCallback(async (password: string) => {
    const response = await apiRequest<{ authenticated: true; csrfToken: string }>('/api/auth/login', {
      method: 'POST',
      body: jsonBody({ password }),
    });
    setState((current) => ({
      setupRequired: false,
      authenticated: true,
      csrfToken: response.csrfToken,
      timezone: current?.timezone ?? 'Europe/Oslo',
    }));
  }, []);

  const logout = useCallback(async () => {
    await apiRequest<void>('/api/auth/logout', { method: 'POST' }, state?.csrfToken);
    setState((current) => ({
      setupRequired: false,
      authenticated: false,
      csrfToken: null,
      timezone: current?.timezone ?? 'Europe/Oslo',
    }));
  }, [state?.csrfToken]);

  const value = useMemo(() => ({ state, loading, error, refresh, setup, login, logout }), [state, loading, error, refresh, setup, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
