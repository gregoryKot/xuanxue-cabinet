// Логика поля «Адрес сайта школы» (В6 аудита, docs/adr/0009-domain-xuanxue-su.md
// дополнение) — тонкая обёртка над useSettingsTextField.ts (CLAUDE.md «Одна
// механика — один компонент»), общей с useNewcomerContactField.ts. Сохранение
// идёт через ту же UseSettingsResult.update, что и шаблоны (useSettings.ts,
// TemplatesScreen.tsx) — отдельного PATCH тут нет.
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import {
  useSettingsTextField,
  type UseSettingsTextFieldResult,
} from './useSettingsTextField';

const SAVE_ERROR = 'Не удалось сохранить адрес сайта школы. Попробуйте ещё раз.';

export type UseSchoolSiteFieldResult = UseSettingsTextFieldResult;

export function useSchoolSiteField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseSchoolSiteFieldResult {
  return useSettingsTextField(settings, update, {
    read: (s) => s.schoolSiteUrl,
    // Пустое поле — явный сброс (null, NULLABLE_SETTINGS_FIELDS в
    // shared/src/settings.ts): «сайта нет», не «оставить как было».
    write: (trimmed) => ({ schoolSiteUrl: trimmed || null }),
    saveError: SAVE_ERROR,
  });
}
