// Логика поля «Кому писать, если человек ещё не в школе» (ADR-0115,
// shared/src/settings.ts) — тонкая обёртка над useSettingsTextField.ts, общей
// с useSchoolSiteField.ts (CLAUDE.md «Одна механика — один компонент»).
// В отличие от адреса сайта, пустое значение недопустимо: контакт нельзя
// сбросить, только заменить другим (UpdateSettingsInput.newcomerContact не
// входит в NULLABLE_SETTINGS_FIELDS) — иначе бот оборвал бы фразу «Напишите …»
// на полуслове.
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import {
  useSettingsTextField,
  type UseSettingsTextFieldResult,
} from './useSettingsTextField';

const SAVE_ERROR = 'Не удалось сохранить контакт для новичков. Попробуйте ещё раз.';

export type UseNewcomerContactFieldResult = UseSettingsTextFieldResult;

export function useNewcomerContactField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseNewcomerContactFieldResult {
  return useSettingsTextField(settings, update, {
    read: (s) => s.newcomerContact,
    write: (trimmed) => ({ newcomerContact: trimmed }),
    saveError: SAVE_ERROR,
    isValid: (trimmed) => trimmed !== '',
  });
}
