// Единственный источник текущей сессии на всё приложение (SECURITY §2: роль
// всегда спрашивается у сервера, не хранится между заходами). LoginScreen,
// RequireAuth, AppShell читают его через useAuth(), а не спрашивают
// /auth/me каждый сам по себе.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MeDto } from '@xuanxue/shared';
import { ApiError, apiFetch, setUnauthorizedListener } from '../api/http';

/** loading — идёт запрос; guest — 401, сессии нет; offline — сетевой сбой
 * (apiFetch status 0) — это не «вы вышли», отдельный экран с повтором, не
 * редирект на /login; ok — есть `me`. */
export type AuthStatus = 'loading' | 'guest' | 'offline' | 'ok';

interface AuthContextValue {
  me: MeDto | null;
  status: AuthStatus;
  refresh: () => Promise<void>;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeDto | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const thisRequest = (requestId.current += 1);
    setStatus('loading');
    try {
      const dto = await apiFetch<MeDto>('/auth/me');
      if (requestId.current !== thisRequest) return; // пришёл более новый refresh()
      setMe(dto);
      setStatus('ok');
    } catch (err) {
      if (requestId.current !== thisRequest) return;
      setMe(null);
      setStatus(err instanceof ApiError && err.status === 0 ? 'offline' : 'guest');
    }
  }, []);

  const clear = useCallback(() => {
    requestId.current += 1; // отменяет ответ уже летящего refresh(), если он есть
    setMe(null);
    setStatus('guest');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 401 из любого запроса после входа (не только из /auth/me выше) — сессия
  // протухла или отозвана посреди работы, сбрасываем себя (CLAUDE.md,
  // ревью п.12): RequireAuth увидит status 'guest' и уведёт на /login.
  useEffect(() => {
    setUnauthorizedListener(clear);
    return () => setUnauthorizedListener(null);
  }, [clear]);

  const value = useMemo(
    () => ({ me, status, refresh, clear }),
    [me, status, refresh, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() вызван вне <AuthProvider>');
  return ctx;
}
