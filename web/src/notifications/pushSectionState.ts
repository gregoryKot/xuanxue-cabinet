// Состояние раздела «Push-уведомления» (ADR-0092, PR №5) — чистая
// асинхронная функция от ответа сервера и окружения браузера. Все ветвления,
// которые ТЗ требует показать человеку по-своему, собраны здесь и проверяются
// без компонента и без usePushSubscription.ts (CLAUDE.md, ревью «тестируется
// без DOM?»).
import { waitServiceWorkerReady } from '../pwa/serviceWorkerReady';
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

  // Таймаут вместо голого `navigator.serviceWorker.ready` (аудит 2026-09-21,
  // HIGH): если регистрация не прошла (registerServiceWorker.ts проглотил
  // ошибку), `ready` не резолвится никогда — без таймера usePushSubscription.ts
  // повис бы в loading вечным скелетоном. `null` бросаем дальше как ошибку:
  // usePushSubscription.load() уже ловит и показывает её в loadError с
  // кнопкой «Повторить» (LoadErrorBanner) — отдельное состояние раздела
  // тут не нужно, оно уже есть.
  const registration = await waitServiceWorkerReady();
  if (!registration) throw new Error('service worker не готов вовремя');
  const subscription = await registration.pushManager.getSubscription();
  return { kind: subscription ? 'subscribed' : 'not-subscribed' };
}
