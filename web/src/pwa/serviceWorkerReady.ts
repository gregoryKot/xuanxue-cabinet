// Ожидание готовности service worker с таймаутом (аудит 2026-09-21, HIGH) —
// `navigator.serviceWorker.ready` сам по себе не резолвится никогда, если
// регистрация не прошла: registerServiceWorker.ts молча глотает ошибку
// (сеть моргнула на /sw.js, приватный режим, блокировка расширением). Без
// таймера кнопка «Включить уведомления» и раздел push на «Профиле» висели
// бы в pending/загрузке вечно — ни ошибки, ни повтора. `Promise.race` с
// таймером здесь неприменим впрямую (race не снимает проигравший таймер) —
// таймер снимается вручную, как только `ready` резолвился первым.

/** 5 секунд — заметно дольше обычной регистрации (миллисекунды), но не
 * заставляет ученика ждать при реальном сбое. */
export const SW_READY_TIMEOUT_MS = 5000;

export function waitServiceWorkerReady(
  timeoutMs: number = SW_READY_TIMEOUT_MS,
): Promise<ServiceWorkerRegistration | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    void navigator.serviceWorker.ready.then((registration) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(registration);
    });
  });
}
