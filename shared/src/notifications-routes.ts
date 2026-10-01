// Записи карты маршрутов (api-routes.ts, ADR-0148) — настройки уведомлений
// человека и подписка браузера на push (ADR-0092). Это `/me/notifications`
// («что присылать»), а не лента `/me/inbox` (inbox-routes.ts). PATCH отдаёт
// настройки целиком: переключатель на экране не ждёт второго GET (отзыв
// владельца 2026-09-21). Отписка — 204: endpoint клиент уже знает.
// `/me/notifications/lessons` — «о каких занятиях» и «за сколько напомнить»
// (ADR-0162): выбор, список активных занятий и своя минута; PUT отдаёт то же,
// что GET, по той же причине, что PATCH. `/notifications/lesson-prefs-stats` —
// число для штата: сколько учеников этим воспользовались (ADR-0162, п. 5).
import type {
  MyLessonNotificationsDto,
  UpdateLessonReminderInput,
  UpdateLessonScopeInput,
} from './lesson-notifications';
import type { LessonPrefsStatsDto } from './lesson-prefs-stats';
import type { NotificationPrefsDto, UpdateNotificationPrefsInput } from './notifications';
import type {
  PushPublicKeyDto,
  PushSubscriptionDto,
  SubscribePushInput,
  UnsubscribePushInput,
} from './push';

export interface NotificationsRoutes {
  'GET /me/notifications': {
    query: undefined;
    body: undefined;
    response: NotificationPrefsDto;
  };
  'PATCH /me/notifications': {
    query: undefined;
    body: UpdateNotificationPrefsInput;
    response: NotificationPrefsDto;
  };
  'GET /me/notifications/lessons': {
    query: undefined;
    body: undefined;
    response: MyLessonNotificationsDto;
  };
  'PUT /me/notifications/lessons/scope': {
    query: undefined;
    body: UpdateLessonScopeInput;
    response: MyLessonNotificationsDto;
  };
  'PUT /me/notifications/lessons/reminder-minutes': {
    query: undefined;
    body: UpdateLessonReminderInput;
    response: MyLessonNotificationsDto;
  };
  'GET /notifications/lesson-prefs-stats': {
    query: undefined;
    body: undefined;
    response: LessonPrefsStatsDto;
  };
  'GET /push/public-key': {
    query: undefined;
    body: undefined;
    response: PushPublicKeyDto;
  };
  'POST /me/push-subscriptions': {
    query: undefined;
    body: SubscribePushInput;
    response: PushSubscriptionDto;
  };
  'DELETE /me/push-subscriptions': {
    query: undefined;
    body: UnsubscribePushInput;
    response: void;
  };
}

export const NOTIFICATIONS_ROUTE_KEYS: Record<keyof NotificationsRoutes, true> = {
  'GET /me/notifications': true,
  'PATCH /me/notifications': true,
  'GET /me/notifications/lessons': true,
  'PUT /me/notifications/lessons/scope': true,
  'PUT /me/notifications/lessons/reminder-minutes': true,
  'GET /notifications/lesson-prefs-stats': true,
  'GET /push/public-key': true,
  'POST /me/push-subscriptions': true,
  'DELETE /me/push-subscriptions': true,
};
