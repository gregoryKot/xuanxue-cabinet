// Состояние раздела «Push-уведомления» (ADR-0092, PR №5) — чистая
// асинхронная функция от ответа сервера и окружения браузера. Все ветвления,
// которые ТЗ требует показать человеку по-своему, собраны здесь и проверяются
// без компонента и без usePushSubscription.ts (CLAUDE.md, ревью «тестируется
// без DOM?»).
import { waitServiceWorkerReady } from '../pwa/serviceWorkerReady';
import { PUSH_SERVICE_WORKER_UNAVAILABLE_MESSAGE } from './pushNotificationsCopy';
import { iosNeedsHomeScreenInstall, isPushBrowserSupported } from './webPushEnvironment';

export type PushSectionState =
  // Push выключен на сервере (нет ключей VAPID) или браузер не умеет —
  // раздела нет вовсе, дальше отличать нечем и незачем.
  | { kind: 'hidden' }
  // iPhone, кабинет не поставлен на экран «Домой» — разрешение не спросить
  // в принципе (Safari 16.4+).
  | { kind: 'ios-install' }
  // Notification.permission === 'default' — разрешение ещё не спрашивали.
  | { kind: 'default' }
  // Notification.permission === 'denied' — браузер запомнил отказ навсегда.
  | { kind: 'denied' }
  // Разрешено, подписка этого браузера на сервере есть.
  | { kind: 'subscribed' }
  // Разрешено, но подписки нет (новое устройство, счищенные данные сайта).
  | { kind: 'not-subscribed' };

/**
 * Регистрация service worker с таймаутом вместо голого `ready`, который не
 * резолвится никогда, если регистрация не прошла — registerServiceWorker.ts
 * глотает ошибку молча (сеть моргнула на `/sw.js`, приватный режим,
 * блокировка), аудит 2026-09-21 HIGH. Общее место для этого файла и
 * usePushSubscription.ts (enable/disable), один текст и один довод, не три
 * копии комментария: простой повтор клика не поможет, регистрация
 * пробуется заново только при перезагрузке страницы (main.tsx).
 */
async function requirePushRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await waitServiceWorkerReady();
  if (!registration) throw new Error(PUSH_SERVICE_WORKER_UNAVAILABLE_MESSAGE);
  return registration;
}

/** Тот же шаг, для usePushSubscription.ts enable()/disable(): не бросает,
 * зовёт `setActionError` и возвращает `null` — кнопка сама выходит из
 * pending, а не попадает в общий catch метода с его общим текстом. */
export async function waitRegistrationOrReportError(
  setActionError: (message: string) => void,
): Promise<ServiceWorkerRegistration | null> {
  try {
    return await requirePushRegistration();
  } catch (err) {
    setActionError(
      err instanceof Error ? err.message : PUSH_SERVICE_WORKER_UNAVAILABLE_MESSAGE,
    );
    return null;
  }
}

/**
 * `publicKey` — ответ `GET /push/public-key` (`null` — push выключен на
 * сервере). Порядок проверок дальше важен: iOS без установки проверяем
 * раньше общей поддержки браузера — Safari может отдавать `PushManager` даже
 * во вкладке, но разрешение там всё равно не спросить (webPushEnvironment.ts),
 * и свернуть это в общую ветку «браузер не умеет» значило бы промолчать
 * там, где есть что объяснить: кнопка, которая ничего не сделает, хуже
 * отсутствия кнопки (ТЗ ПР №5).
 */
export async function resolvePushSectionState(
  publicKey: string | null,
): Promise<PushSectionState> {
  if (publicKey === null) return { kind: 'hidden' };
  if (iosNeedsHomeScreenInstall()) return { kind: 'ios-install' };
  if (!isPushBrowserSupported()) return { kind: 'hidden' };

  const permission = Notification.permission;
  if (permission === 'denied') return { kind: 'denied' };
  if (permission === 'default') return { kind: 'default' };

  // Исключение requirePushRegistration() ловит usePushSubscription.load()
  // как loadError, с кнопкой «Повторить» — отдельное состояние раздела не
  // нужно, оно уже есть.
  const registration = await requirePushRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return { kind: subscription ? 'subscribed' : 'not-subscribed' };
}
