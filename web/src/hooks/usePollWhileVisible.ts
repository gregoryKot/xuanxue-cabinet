// Опрос, пока вкладка видима (CLAUDE.md «Приложение на телефоне»):
// установленное приложение живёт неделями без перезагрузки, а без опроса
// значение застыло бы на первой отрисовке оболочки. Скрытая вкладка не жжёт
// батарею и не ходит в сеть — таймер снимается вместе с visibilitychange в
// 'hidden' и не заводится, если вкладка скрыта уже при монтировании. На
// возврате refresh() зовётся сразу, не дожидаясь целого тика: значение иначе
// устарело бы ровно на время, что вкладка была скрыта.
import { useEffect, useRef } from 'react';

/**
 * `refresh` держим в ref, а не в зависимостях эффекта — тот же приём, что
 * `loadRef` в useAbortableFetch.ts: иначе хук вроде useNotificationsData
 * (обновляющая функция пересоздаётся каждым рендером) переподписывался бы на
 * каждый рендер и сбивал бы отсчёт интервала.
 */
export function usePollWhileVisible(refresh: () => void, intervalMs: number): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;

    function stop(): void {
      if (intervalId === undefined) return;
      clearInterval(intervalId);
      intervalId = undefined;
    }

    // Снимаем прежний таймер перед новым: visibilitychange приходит и без
    // смены состояния (Safari шлёт его на pageshow), и без этой строки
    // прежний setInterval остался бы висеть без ссылки — опрос пошёл бы вдвое
    // чаще, и с каждым таким событием ещё вдвое.
    function start(): void {
      stop();
      intervalId = setInterval(() => refreshRef.current(), intervalMs);
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        stop();
        return;
      }
      refreshRef.current();
      start();
    }

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
}
