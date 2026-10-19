// Записи карты маршрутов (api-routes.ts, ADR-0148) — настройки уведомлений
// человека и подписка браузера на push (ADR-0092). Это `/me/notifications`
// («что присылать»), а не лента `/me/inbox` (inbox-routes.ts). PATCH отдаёт
// настройки целиком: переключатель на экране не ждёт второго GET (отзыв
// владельца 2026-09-21). Отписка — 204: endpoint клиент уже знает.
// `/me/notifications/lessons` — «о каких занятиях» для отмен, записей и новых
// материалов (ADR-0162): выбор и список активных занятий; PUT отдаёт то же, что GET,
// по той же причине, что PATCH. `/notifications/lesson-prefs-stats` — число для
// штата: у скольких учеников есть выбор напоминаний и своё «за сколько» (ADR-0185).
// `/me/notifications/lessons/sync` — снимок настроек напоминаний целиком для
// браузера и для приложения Daychi (ADR-0185); PATCH к нему меняет указанные ключи
// и отдаёт новый снимок целиком.
import type {
  MyLessonNotificationsDto,
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
import type { ReminderSyncPatch, ReminderSyncSnapshot } from './reminder-sync';

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
  'GET /me/notifications/lessons/sync': {
    query: undefined;
    body: undefined;
    response: ReminderSyncSnapshot;
  };
  'PATCH /me/notifications/lessons/sync': {
    query: undefined;
    body: ReminderSyncPatch;
    response: ReminderSyncSnapshot;
  };
  'PUT /me/notifications/lessons/scope': {
    query: undefined;
    body: UpdateLessonScopeInput;
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
  'GET /me/notifications/lessons/sync': true,
  'PATCH /me/notifications/lessons/sync': true,
  'PUT /me/notifications/lessons/scope': true,
  'GET /notifications/lesson-prefs-stats': true,
  'GET /push/public-key': true,
  'POST /me/push-subscriptions': true,
  'DELETE /me/push-subscriptions': true,
};
