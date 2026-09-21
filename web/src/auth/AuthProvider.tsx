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
 * редирект на /login; ok — есть `me`; blocked — сессия жива (cookie
 * валиден), но AuthGuard отверг запрос 403-м (SECURITY §2, `status: 'blocked'`
 * человека) — `me` остаётся `null`, RequireAuth покажет ACCESS_MESSAGE вместо
 * ухода на /login (там человек только заново получил бы тот же отказ). */
export type AuthStatus = 'loading' | 'guest' | 'offline' | 'ok' | 'blocked';

interface AuthContextValue {
  me: MeDto | null;
  status: AuthStatus;
  refresh: () => Promise<void>;
  /** Принять профиль, который уже на руках: запись своего профиля (`PATCH
   * /me/profile`, `PUT /me/no-telegram`, `POST /auth/email/link`) возвращает
   * свежий `MeDto`, и второй `GET /auth/me` за тем же самым не нужен —
   * ADR-0087, тот же приём, что `applyData` у hooks/useAbortableFetch.ts. */
  applyMe: (next: MeDto) => void;
  clear: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const FORBIDDEN_STATUS = 403;

/** Сессия есть (cookie валиден) — `ok` или `blocked`; пускать ли дальше,
 * решает уже RequireAuth. Экраны входа (LoginScreen, JoinScreen,
 * EmailLoginCallbackScreen) используют её вместо `status === 'ok'`, чтобы не
 * держать заблокированного на форме входа — там ему нечего делать, и он
 * уходит в кабинет, где RequireAuth покажет ACCESS_MESSAGE. */
export function hasSession(status: AuthStatus): boolean {
  return status === 'ok' || status === 'blocked';
}

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
      // 403 — не «сессии нет» (guest увёл бы на /login, где человек снова
      // жмёт «Войти» и снова получает тот же отказ): AuthGuard отвергает
      // status: 'blocked' 403-м на каждый запрос (SECURITY §2), cookie при
      // этом валиден. RequireAuth отличает эту ветку от guest и offline.
      if (err instanceof ApiError && err.status === 0) {
        setStatus('offline');
      } else if (err instanceof ApiError && err.status === FORBIDDEN_STATUS) {
        setStatus('blocked');
      } else {
        setStatus('guest');
      }
    }
  }, []);

  // Счётчик двигаем и здесь: человек мог нажать «Сохранить» в момент, когда
  // висит refresh() (он же идёт на монтировании) — без "+1" тот ответил бы
  // позже и вернул профиль ДО записи. Та же гонка и то же лечение, что у
  // clear() ниже и у applyData в hooks/useAbortableFetch.ts.
  const applyMe = useCallback((next: MeDto) => {
    requestId.current += 1;
    setMe(next);
    // Запись своего профиля прошла — значит сессия жива и не заблокирована
    // (AuthGuard отверг бы её 403-м, SECURITY §2), так что 'ok' здесь не
    // догадка.
    setStatus('ok');
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
    () => ({ me, status, refresh, applyMe, clear }),
    [me, status, refresh, applyMe, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() вызван вне <AuthProvider>');
  return ctx;
}
