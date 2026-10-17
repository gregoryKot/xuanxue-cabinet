// Кнопка, которая уводит вкладку на внешний вход (Telegram, Google), стоит
// «занятой» до самого перехода — иначе двойной клик на медленной сети увёл бы
// вкладку дважды (GoogleLoginButton.tsx, TelegramLoginSection.tsx,
// GoogleLinkSection.tsx). Но переход можно отменить: на iPhone человек нажал,
// передумал и вернулся «Назад» — Safari достаёт страницу из кеша (bfcache)
// вместе с состоянием React, и оба спиннера крутятся навсегда (снимок
// владельца 2026-10-18). То же, если Telegram открылся приложением, а вкладка
// осталась: возврат к ней — тот же тупик. Один хук на все три кнопки
// (CLAUDE.md «Одна механика — один компонент»).
import { useCallback, useEffect, useState } from 'react';

/** `pending` — вкладка уходит; `markLeaving` ставит его перед переходом.
 * Снимается, когда страница вернулась из кеша (`pageshow` с `persisted`) или
 * вкладка снова видима: переход не состоялся, кнопка должна работать. */
export function useLeavePending(): [pending: boolean, markLeaving: () => void] {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!pending) return;
    function handlePageShow(event: PageTransitionEvent): void {
      if (event.persisted) setPending(false);
    }
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') setPending(false);
    }
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pending]);

  const markLeaving = useCallback(() => setPending(true), []);
  return [pending, markLeaving];
}
