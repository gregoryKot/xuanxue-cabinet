import { describe, expect, it } from 'vitest';
import { PAYMENT_REMINDER_PLACEHOLDERS, SETTINGS_LIMITS } from '@xuanxue/shared';
import { validateTemplateText } from './templateValidation';

describe('validateTemplateText', () => {
  it('пустой (только пробелы) текст — ошибка', () => {
    expect(validateTemplateText('   \n  ')).toMatch(/не может быть пустым/);
  });

  it('слишком длинный текст — ошибка с лимитом', () => {
    const text = 'a'.repeat(SETTINGS_LIMITS.templateMaxLength + 1);
    expect(validateTemplateText(text)).toMatch(String(SETTINGS_LIMITS.templateMaxLength));
  });

  it('неизвестный плейсхолдер — ошибка с именем', () => {
    expect(validateTemplateText('Привет {дата}')).toMatch(/\{дата\}/);
  });

  it('известные плейсхолдеры — валидно', () => {
    expect(validateTemplateText('Через {минут} минут {название}')).toBeNull();
  });

  it('свой allow-list: подстановка поста неизвестна напоминанию, и наоборот', () => {
    expect(
      validateTemplateText('Пароль {пароль}', PAYMENT_REMINDER_PLACEHOLDERS),
    ).toMatch(/\{пароль\}/);
    expect(
      validateTemplateText(
        '{имя}, за {месяц} {сумма} {ссылка}',
        PAYMENT_REMINDER_PLACEHOLDERS,
      ),
    ).toBeNull();
    expect(validateTemplateText('Здравствуйте, {имя}')).toMatch(/\{имя\}/);
  });
});
