// Логика поля «Кому и куда присылать скриншот об оплате» (ADR-0159,
// shared/src/settings.ts) — тонкая обёртка над useSettingsTextField.ts, общей с
// useNewcomerContactField.ts (CLAUDE.md «Одна механика — один компонент»).
// Пустое значение недопустимо, как у контакта для новичков: контакт нельзя
// сбросить, только заменить другим (UpdateSettingsInput.paymentContact не
// входит в NULLABLE_SETTINGS_FIELDS) — иначе напоминание об оплате оборвалось
// бы на «Отправьте скриншот об оплате …» без имени.
import type { SettingsDto, UpdateSettingsInput } from '@xuanxue/shared';
import {
  useSettingsTextField,
  type UseSettingsTextFieldResult,
} from '../templates/useSettingsTextField';

const SAVE_ERROR = 'Не удалось сохранить контакт для оплаты. Попробуйте ещё раз.';

export function usePaymentContactField(
  settings: SettingsDto | null,
  update: (input: UpdateSettingsInput) => Promise<void>,
): UseSettingsTextFieldResult {
  return useSettingsTextField(settings, update, {
    read: (s) => s.paymentContact,
    write: (trimmed) => ({ paymentContact: trimmed }),
    saveError: SAVE_ERROR,
    isValid: (trimmed) => trimmed !== '',
  });
}
