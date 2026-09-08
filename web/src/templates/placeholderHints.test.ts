// Гейт: у каждой подстановки из allow-list — непустое пояснение (образец
// сверки — api/src/common/field-labels-coverage.spec.ts). Новая подстановка
// в TEMPLATE_PLACEHOLDERS без пары здесь падает тестом, а не молчит на экране.
import { describe, expect, it } from 'vitest';
import { TEMPLATE_PLACEHOLDERS } from '@xuanxue/shared';
import { PLACEHOLDER_HINTS } from './placeholderHints';

describe('placeholderHints — покрытие', () => {
  it('у каждого имени из TEMPLATE_PLACEHOLDERS есть непустое пояснение', () => {
    const missing = TEMPLATE_PLACEHOLDERS.filter(
      (name) => !PLACEHOLDER_HINTS[name] || PLACEHOLDER_HINTS[name].trim() === '',
    );
    expect(missing).toEqual([]);
  });

  it('в объекте нет лишних имён вне allow-list', () => {
    const known = new Set<string>(TEMPLATE_PLACEHOLDERS);
    const extra = Object.keys(PLACEHOLDER_HINTS).filter((name) => !known.has(name));
    expect(extra).toEqual([]);
  });
});
