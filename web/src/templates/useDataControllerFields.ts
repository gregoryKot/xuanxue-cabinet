// Логика двух полей «Кто отвечает за данные» на экране «Шаблоны»: имя и способ
// связи (shared/src/settings.ts, страница `/privacy`). Обёртка над
// useSettingsTextField.ts, общей с адресом сайта и контактом для новичков
// (CLAUDE.md «Одна механика — один компонент»). Пустое поле — явный сброс
// (`null`, NULLABLE_SETTINGS_FIELDS): «не указано», а не «оставить как было»;
// страница тогда честно отправляет учеников к учителю.
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import {
  useSettingsTextField,
  type UseSettingsTextFieldResult,
} from './useSettingsTextField';

const NAME_SAVE_ERROR =
  'Не удалось сохранить, кто отвечает за данные. Попробуйте ещё раз.';
const CONTACT_SAVE_ERROR = 'Не удалось сохранить способ связи. Попробуйте ещё раз.';

export interface UseDataControllerFieldsResult {
  name: UseSettingsTextFieldResult;
  contact: UseSettingsTextFieldResult;
}

export function useDataControllerFields(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseDataControllerFieldsResult {
  const name = useSettingsTextField(settings, update, {
    read: (s) => s.dataControllerName,
    write: (trimmed) => ({ dataControllerName: trimmed || null }),
    saveError: NAME_SAVE_ERROR,
  });
  const contact = useSettingsTextField(settings, update, {
    read: (s) => s.dataControllerContact,
    write: (trimmed) => ({ dataControllerContact: trimmed || null }),
    saveError: CONTACT_SAVE_ERROR,
  });
  return { name, contact };
}
