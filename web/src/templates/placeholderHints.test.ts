// Гейт: у каждой подстановки из allow-list — непустое пояснение (образец
// сверки — api/src/common/field-labels-coverage.spec.ts). Новая подстановка
// в TEMPLATE_PLACEHOLDERS или PAYMENT_REMINDER_PLACEHOLDERS без пары здесь
// падает тестом, а не молчит на экране.
import { describe, expect, it } from 'vitest';
import { PAYMENT_REMINDER_PLACEHOLDERS, TEMPLATE_PLACEHOLDERS } from '@xuanxue/shared';
import { PAYMENT_REMINDER_HINTS, PLACEHOLDER_HINTS } from './placeholderHints';

const DICTIONARIES = [
  { title: 'постов', names: TEMPLATE_PLACEHOLDERS, hints: PLACEHOLDER_HINTS },
  {
    title: 'напоминания об оплате',
    names: PAYMENT_REMINDER_PLACEHOLDERS,
    hints: PAYMENT_REMINDER_HINTS,
  },
] as const;

describe.each(DICTIONARIES)('пояснения подстановок $title — покрытие', (dictionary) => {
  const hints: Record<string, string> = dictionary.hints;

  it('у каждого имени из allow-list есть непустое пояснение', () => {
    const missing = dictionary.names.filter((name) => !hints[name]?.trim());
    expect(missing).toEqual([]);
  });

  it('в словаре нет лишних имён вне allow-list', () => {
    const known = new Set<string>(dictionary.names);
    const extra = Object.keys(hints).filter((name) => !known.has(name));
    expect(extra).toEqual([]);
  });
});
