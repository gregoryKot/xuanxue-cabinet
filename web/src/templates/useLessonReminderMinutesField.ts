// Поле «За сколько минут напомнить ученикам о занятии» (ADR-0135) —
// тонкая обёртка над общей механикой числового поля минут
// (useMinutesField.ts), тем же приёмом, что usePreviewMinutesField.ts рядом.
import { DEFAULT_LESSON_REMINDER_MINUTES, SETTINGS_LIMITS } from '@xuanxue/shared';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { useMinutesField, type UseMinutesFieldResult } from './useMinutesField';

const SAVE_ERROR = 'Не удалось сохранить напоминание о занятии. Попробуйте ещё раз.';

export function useLessonReminderMinutesField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseMinutesFieldResult {
  return useMinutesField(settings, update, {
    read: (s) => s.lessonReminderMinutes,
    write: (lessonReminderMinutes) => ({ lessonReminderMinutes }),
    defaultValue: DEFAULT_LESSON_REMINDER_MINUTES,
    min: SETTINGS_LIMITS.lessonReminderMinutesMin,
    max: SETTINGS_LIMITS.lessonReminderMinutesMax,
    saveError: SAVE_ERROR,
  });
}
