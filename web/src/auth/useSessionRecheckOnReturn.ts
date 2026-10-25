// Вход по ссылке из письма завершается в другой вкладке: эта узнаёт о сессии,
// только перечитав /auth/me, когда человек к ней вернётся. Общий приём экрана
// входа Daychi (useNativeLogin.ts) и экрана входа из wiki (LoginScreen.tsx)
// — CLAUDE.md «Одна механика — один компонент».
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';

/** Пока `enabled`, возвращение к вкладке (фокус окна или она снова видима)
 * перечитывает сессию. Скрытая вкладка не спрашивает: событие
 * `visibilitychange` приходит и при уходе из неё. */
export function useSessionRecheckOnReturn(enabled: boolean): void {
  const { refresh } = useAuth();

  useEffect(() => {
    if (!enabled) return;
    function handleReturn(): void {
      if (document.visibilityState === 'visible') void refresh();
    }
    window.addEventListener('focus', handleReturn);
    document.addEventListener('visibilitychange', handleReturn);
    return () => {
      window.removeEventListener('focus', handleReturn);
      document.removeEventListener('visibilitychange', handleReturn);
    };
  }, [enabled, refresh]);
}
