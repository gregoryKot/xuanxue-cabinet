// Решение для выгрузки данных (ADR-0160) по настройкам уведомлений. Вынесено из
// user-export.registry.ts: файл выше потолка храповика, а список полей растёт
// вместе с настройками. Ключ — модель из USER_OWNED_COLLECTIONS; полноту держат
// `tsc` (Record<ExportedModel, …>) и user-export.registry.spec.ts, которые
// сверяют `include` с полями схемы.
import type { ExportSectionSpec } from '../users/user-export.registry';

export const NOTIFICATION_PREFS_EXPORT_SECTIONS: Record<
  'NotificationPrefsRecord',
  ExportSectionSpec
> = {
  NotificationPrefsRecord: {
    title: 'Настройки уведомлений',
    retention: 'Пока существует аккаунт',
    include: [
      'overrides',
      'paymentReminderDay',
      'lessonScopeMode',
      'lessonClassIds',
      'lessonReminderMinutes',
      'reminderClassIds',
      'reminderLessonIds',
      'reminderRevision',
    ],
    omit: {},
  },
};
