// Проверка и подготовка PATCH /settings.paymentReminder — чистая логика,
// юнит-тест без Mongo (ADR-0051). Движок подстановок общий с постами
// (shared/src/templates.ts), allow-list свой.
import {
  PAYMENT_REMINDER_PLACEHOLDERS,
  findUnknownPlaceholders,
  type PaymentReminderSettings,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

const AVAILABLE = PAYMENT_REMINDER_PLACEHOLDERS.map((name) => `{${name}}`).join(', ');

/** Неизвестные подстановки в тексте напоминания — 400 с перечнем доступных:
 * опечатка в `{имя}` иначе уехала бы ученику буквально, со скобками. */
export function assertKnownReminderPlaceholders(template: string | undefined): void {
  if (template === undefined) return;
  const unknown = findUnknownPlaceholders(template, PAYMENT_REMINDER_PLACEHOLDERS);
  if (unknown.length === 0) return;
  throw new InvalidInputError(
    `В тексте напоминания об оплате неизвестные подстановки: ${unknown
      .map((name) => `{${name}}`)
      .join(', ')}. Доступные: ${AVAILABLE}.`,
  );
}

/** `$set` по точечным путям `paymentReminder.<поле>` — только переданные
 * поля: целиком подобъект затёр бы соседние настройки, которые форма не
 * трогала. Значения `undefined` (class-transformer материализует поля DTO
 * даже для пустого тела) пропускаются. */
export function paymentReminderSetFrom(
  reminder: Partial<PaymentReminderSettings>,
): Record<string, boolean | number | string> {
  const $set: Record<string, boolean | number | string> = {};
  for (const [field, value] of Object.entries(reminder)) {
    if (value !== undefined) $set[`paymentReminder.${field}`] = value;
  }
  return $set;
}
