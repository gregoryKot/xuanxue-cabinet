// Поле «За сколько минут показывать черновик» (docs/PLAN.md §6, ТЗ
// preview-minutes.md) — тонкая обёртка над общей механикой числового поля
// минут (useMinutesField.ts, CLAUDE.md «Одна механика — один компонент»):
// сама логика (парсинг, диапазон, синхронизация, PATCH) одна на оба поля
// минут экрана «Шаблоны», здесь только то, какое поле читать/писать.
import { DEFAULT_PREVIEW_MINUTES, SETTINGS_LIMITS } from '@xuanxue/shared';
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import { useMinutesField, type UseMinutesFieldResult } from './useMinutesField';

const SAVE_ERROR = 'Не удалось сохранить время предпросмотра. Попробуйте ещё раз.';

export function usePreviewMinutesField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseMinutesFieldResult {
  return useMinutesField(settings, update, {
    read: (s) => s.previewMinutes,
    write: (previewMinutes) => ({ previewMinutes }),
    defaultValue: DEFAULT_PREVIEW_MINUTES,
    min: SETTINGS_LIMITS.previewMinutesMin,
    max: SETTINGS_LIMITS.previewMinutesMax,
    saveError: SAVE_ERROR,
  });
}
