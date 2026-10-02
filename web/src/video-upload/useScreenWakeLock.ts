// Экран не гаснет, пока видео готовится и грузится (ADR-0165): на iPhone экран
// тускнеет через полминуты, iOS усыпляет страницу, и загрузка встаёт. Блокировка
// сна — улучшение, а не условие: без неё (старый браузер, экономия батареи)
// загрузка идёт как шла, поэтому отказ не показываем человеку и не шлём в
// reportClientError — владельца будили бы без причины.
import { useEffect } from 'react';

/** Снять блокировку и не расстраиваться, если браузер её уже снял сам. */
function releaseQuietly(lock: WakeLockSentinel | null): void {
  void lock?.release().catch(() => undefined);
}

/** Пока `isActive` — держит блокировку сна экрана. Браузер сам снимает её,
 * когда страница уходит в фон, поэтому при возврате берём заново, если
 * загрузка ещё идёт. Без `navigator.wakeLock` (Safari до 16.4) — ничего не
 * делает. */
export function useScreenWakeLock(isActive: boolean): void {
  useEffect(() => {
    if (!isActive || !('wakeLock' in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let isRequesting = false;
    let isDisposed = false;

    const acquire = () => {
      // Одна блокировка на раз: пока держим или ждём ответ, повторно не просим.
      // В фоне запрос отказал бы сам — дождёмся `visibilitychange`.
      if (isDisposed || isRequesting || lock) return;
      if (document.visibilityState !== 'visible') return;
      isRequesting = true;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          isRequesting = false;
          if (isDisposed) {
            // Загрузка кончилась, пока шёл запрос — блокировка уже не нужна.
            releaseQuietly(sentinel);
            return;
          }
          lock = sentinel;
          // Событие приходит один раз — когда браузер (фон страницы) или мы сами
          // снимаем блокировку; новую просим только после него.
          sentinel.addEventListener('release', () => {
            lock = null;
          });
        })
        .catch(() => {
          isRequesting = false;
        });
    };

    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', acquire);
      releaseQuietly(lock);
    };
  }, [isActive]);
}
