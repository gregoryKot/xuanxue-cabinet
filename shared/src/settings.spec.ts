import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_CONTACT, RULE_TIME_RE } from './domain';
import { DEFAULT_PAYMENT_REMINDER, SETTINGS_LIMITS } from './settings';
import { PAYMENT_REMINDER_PLACEHOLDERS, findUnknownPlaceholders } from './templates';

describe('DEFAULT_PAYMENT_REMINDER', () => {
  // Дефолт проходит те же проверки, что и PATCH: иначе форма «Шаблоны» на
  // старой базе показала бы значение, которое сама же не даст сохранить.
  it('время и шаблон допустимы для PATCH', () => {
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

  it('дня у школы нет — день выбирает ученик (ADR-0161)', () => {
    expect(DEFAULT_PAYMENT_REMINDER).not.toHaveProperty('dayOfMonth');
  });

  it('по умолчанию выключено — слои «Оплаты» и ученика ещё не сделаны', () => {
    expect(DEFAULT_PAYMENT_REMINDER.enabled).toBe(false);
  });
});

describe('DEFAULT_PAYMENT_CONTACT', () => {
  it('влезает в предел поля, иначе форма «Шаблоны» не дала бы его сохранить', () => {
    expect(DEFAULT_PAYMENT_CONTACT.length).toBeLessThanOrEqual(
      SETTINGS_LIMITS.paymentContactMaxLength,
    );
  });

  // Способ связи — внутри контакта, а не в шаблоне (ADR-0159): учитель может
  // вписать WhatsApp, и фраза «…отправьте {контакт}.» не должна обещать Telegram.
  it('способ связи в самом контакте, а не в шаблоне напоминания', () => {
    expect(DEFAULT_PAYMENT_CONTACT).toContain('Telegram');
    expect(DEFAULT_PAYMENT_REMINDER.template).not.toContain('Telegram');
  });
});
