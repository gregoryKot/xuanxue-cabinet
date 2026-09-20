// Вид уведомления «Сообщение от учителя» убран из `NOTIFICATION_KINDS`
// (ADR-0062) — эта миграция убирает его же из данных. Почему это нужно, чем
// безопасно при деплое и откате и почему идемпотентно — в шапке
// pull-notification-override.ts, там же сам `$pull`.
import type { mongo } from 'mongoose';
import { pullNotificationOverride } from './pull-notification-override';

type Db = mongo.Db;

// Значения `teacher_message` больше нет в `NotificationKind` — миграция
// хранит его сырой строкой (исторический факт о данных), не импортом из
// `@xuanxue/shared`. Спек импортирует именно эту константу, а не дублирует
// строку: значение remove-цели живёт в репозитории ровно в одном месте.
export const REMOVED_KIND_TEACHER_MESSAGE = 'teacher_message';

export const notificationPrefsTeacherMessageRemoved = {
  id: '0011-notification-prefs-teacher-message-removed',
  up: (db: Db): Promise<void> =>
    pullNotificationOverride(db, REMOVED_KIND_TEACHER_MESSAGE),
};
