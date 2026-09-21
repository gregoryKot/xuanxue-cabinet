// push_subscriptions — подписка браузера на web push (ADR-0092, «Порядок
// работ» PR №3). Контракт api/web: DTO в api объявляется как `implements`
// типов ниже, расхождение ловит tsc (CLAUDE.md «Слои»). Текст push сюда не
// попадает — сервер шлёт пустой пинг, worker сам читает свежую строку из
// ленты (`GET /me/inbox`, ADR-0061); здесь только сама подписка и её ключ.

/** Тело `POST /me/push-subscriptions` — ровно то, что отдаёт браузер из
 * `pushManager.subscribe().toJSON()`: адрес push-сервиса и два ключа
 * шифрования содержимого (RFC 8291). Кабинет их не расшифровывает сам —
 * запись используется PR №4 (VAPID-подпись и доставка). */
export interface SubscribePushInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Тело `DELETE /me/push-subscriptions` — отписка по `endpoint`, не по `id`:
 * на клиенте есть только он (`pushManager.getSubscription()`), внутренний id
 * записи браузеру не известен. */
export interface UnsubscribePushInput {
  endpoint: string;
}

/** Ответ на подписку — без `p256dh`/`auth` (CLAUDE.md «API»: секреты
 * доставки не покидают сервер, как токен канала). */
export interface PushSubscriptionDto {
  id: string;
  endpoint: string;
  createdAt: string; // ISO UTC с Z
  updatedAt: string; // ISO UTC с Z
}

/** Ответ `GET /push/public-key` — `null`, когда push выключен конфигурацией
 * (нет переменных VAPID_*): риск за флагом, CLAUDE.md, ADR-0092. */
export interface PushPublicKeyDto {
  publicKey: string | null;
}

export const PUSH_SUBSCRIPTION_LIMITS = {
  // Реальные адреса push-сервисов (FCM, Mozilla autopush) короче на порядок —
  // запас на будущих провайдеров.
  endpoint: 500,
  // p256dh — несжатая точка P-256 (65 байт) в base64url без паддинга — 87
  // символов; auth — 16 байт — 22 символа (RFC 8291). Лимит с запасом, не
  // точная длина: значения отдаёт браузер сам, наше дело — не пустить сюда
  // произвольный мусор, а не подтверждать формат байт в байт.
  p256dh: 128,
  auth: 64,
} as const;

// Символы base64url (RFC 4648 §5) без паддинга — так `PushSubscriptionJSON.keys`
// отдаёт браузер.
export const PUSH_SUBSCRIPTION_KEY_RE = /^[A-Za-z0-9_-]+$/;

// VOICE.md: что случилось и что это не отменяет. Push — добавка (ADR-0092):
// расписание и так приходит в Telegram и в кабинет.
export const PUSH_NOT_AVAILABLE_MESSAGE =
  'Push-уведомления пока не подключены. Расписание и напоминания по-прежнему приходят в Telegram и в кабинет.';
