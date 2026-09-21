// Конвертеры base64url ↔ байты для web push (ADR-0092, PR №5). Нужны ровно
// в двух местах usePushSubscription.ts: GET /push/public-key отдаёт
// applicationServerKey base64url-строкой, а pushManager.subscribe() ждёт
// Uint8Array; обратно — subscription.getKey('p256dh'|'auth') отдают
// ArrayBuffer, а SubscribePushInput (shared/src/push.ts) ждёт base64url.
// Ошибка здесь тихая (не бросает, просто даёт мусорные байты/строку) —
// отдельный файл и юнит-тест ниже, а не код в хуке, где сбой было бы не с
// чем сравнить (ТЗ PR №5, docs/adr/0092-web-push-returns.md).
//
// atob/btoa — стандартные глобальные функции браузера (и jsdom в тестах),
// решение «не тянуть зависимость ради двух строк с кодировкой» (CLAUDE.md
// «Зависимости»).

/** base64url (RFC 4648 §5, без паддинга) → Uint8Array — вход для
 * `pushManager.subscribe({ applicationServerKey })`. Явный параметр
 * `<ArrayBuffer>`: `PushSubscriptionOptions.applicationServerKey` (`BufferSource`,
 * TS 5.7+) ждёт Uint8Array именно над `ArrayBuffer`, а безымянный `Uint8Array`
 * по умолчанию шире (`ArrayBufferLike`, куда входит и `SharedArrayBuffer`) —
 * `new Uint8Array(length)` и так создаёт `ArrayBuffer`, аннотация только
 * называет это явно. */
export function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** ArrayBuffer → base64url без паддинга — ключи из `subscription.getKey(…)`
 * перед отправкой на `POST /me/push-subscriptions`
 * (PUSH_SUBSCRIPTION_KEY_RE в shared/src/push.ts ждёт именно этот алфавит). */
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
