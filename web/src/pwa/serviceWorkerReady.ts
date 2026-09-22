// Ожидание готовности service worker с таймаутом (аудит 2026-09-21, HIGH) —
// `navigator.serviceWorker.ready` сам по себе не резолвится никогда, если
// регистрация не прошла: registerServiceWorker.ts мог не зарегистрировать
// worker (сеть моргнула на /sw.js, приватный режим, блокировка расширением) —
// его отказ теперь виден в консоли (main.tsx, баг с прода 2026-09-22), но сам
// `ready` об этом не узнаёт. Без предела кнопка «Включить уведомления» и
// раздел push на «Профиле» висели бы в pending/загрузке вечно — ни ошибки,
// ни повтора. Таймаут — через общий web/src/lib/withTimeout.ts, тот же
// helper, что у subscribe()/getSubscription()/unsubscribe() в
// usePushSubscription.ts: не вторая копия «гонка + settled-флаг» (CLAUDE.md
// «Одна механика — один компонент»). Здесь предел не бросает исключение
// наружу, а превращается в `null` — так было раньше и это отдельное,
// самостоятельное состояние для requirePushRegistration() (pushSectionState.ts).
import { withTimeout } from '../lib/withTimeout';

/** 5 секунд — заметно дольше обычной регистрации (миллисекунды), но не
 * заставляет ученика ждать при реальном сбое. */
export const SW_READY_TIMEOUT_MS = 5000;

// Текст ошибки withTimeout здесь никто не видит: catch сразу превращает её в
// null, а requirePushRegistration() (pushSectionState.ts) отдаёт свой
// собственный текст (PUSH_SERVICE_WORKER_UNAVAILABLE_MESSAGE) дальше.
const SW_NOT_READY_MESSAGE = 'service worker не стал ready вовремя';

export function waitServiceWorkerReady(
  timeoutMs: number = SW_READY_TIMEOUT_MS,
): Promise<ServiceWorkerRegistration | null> {
  return withTimeout(
    navigator.serviceWorker.ready,
    timeoutMs,
    SW_NOT_READY_MESSAGE,
  ).catch(() => null);
}
