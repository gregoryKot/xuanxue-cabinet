// Вид уведомления «Занятие скоро» убран из `NOTIFICATION_KINDS` (ADR-0069) —
// эта миграция убирает его же из данных. Почему это нужно, чем безопасно при
// деплое и откате и почему идемпотентно — в шапке
// pull-notification-override.ts, там же сам `$pull`.
//
// Лента кабинета (`notifications`) сюда не входит намеренно: единственный, кто
// в неё пишет, — `InAppExamNotifier` (in-app-exam-notifier.ts), и пишет он
// только `exam_result` и `attempt_submitted`. Записи с «Занятие скоро» в ней
// взяться неоткуда — доставки у вида не было ни дня (ADR-0069), поэтому
// запроса за данными, которых не бывает, здесь нет.
import type { mongo } from 'mongoose';
import { pullNotificationOverride } from './pull-notification-override';

type Db = mongo.Db;

// Сырая строка, не импорт из `@xuanxue/shared`, — та же причина, что у
// `REMOVED_KIND_TEACHER_MESSAGE` в миграции 0011: значения больше нет в
// `NotificationKind`, миграция хранит исторический факт о данных.
export const REMOVED_KIND_LESSON_SOON = 'lesson_soon';

export const notificationPrefsLessonSoonRemoved = {
  id: '0012-notification-prefs-lesson-soon-removed',
  up: (db: Db): Promise<void> => pullNotificationOverride(db, REMOVED_KIND_LESSON_SOON),
};
