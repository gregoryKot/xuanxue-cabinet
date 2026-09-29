import { describe, expect, it } from 'vitest';
import { RULE_TIME_RE } from './domain';
import { DEFAULT_PAYMENT_REMINDER, SETTINGS_LIMITS } from './settings';
import { PAYMENT_REMINDER_PLACEHOLDERS, findUnknownPlaceholders } from './templates';

describe('DEFAULT_PAYMENT_REMINDER', () => {
  // Дефолт проходит те же проверки, что и PATCH: иначе форма «Шаблоны» на
  // старой базе показала бы значение, которое сама же не даст сохранить.
  it('день, время и шаблон допустимы для PATCH', () => {
    expect(DEFAULT_PAYMENT_REMINDER.dayOfMonth).toBeGreaterThanOrEqual(
      SETTINGS_LIMITS.paymentReminderDayMin,
    );
    expect(DEFAULT_PAYMENT_REMINDER.dayOfMonth).toBeLessThanOrEqual(
      SETTINGS_LIMITS.paymentReminderDayMax,
    );
    expect(DEFAULT_PAYMENT_REMINDER.time).toMatch(RULE_TIME_RE);
    expect(DEFAULT_PAYMENT_REMINDER.template.length).toBeLessThanOrEqual(
      SETTINGS_LIMITS.templateMaxLength,
    );
    expect(
      findUnknownPlaceholders(
        DEFAULT_PAYMENT_REMINDER.template,
        PAYMENT_REMINDER_PLACEHOLDERS,
      ),
    ).toEqual([]);
  });

  it('по умолчанию выключено — слои «Оплаты» и ученика ещё не сделаны', () => {
    expect(DEFAULT_PAYMENT_REMINDER.enabled).toBe(false);
  });
});
