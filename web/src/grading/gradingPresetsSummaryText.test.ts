import { describe, expect, it } from 'vitest';
import { formatGradingPresetsHint } from './gradingPresetsSummaryText';

describe('formatGradingPresetsHint', () => {
  it('null — общий текст без числа (список ещё грузится или сбой)', () => {
    expect(formatGradingPresetsHint(null)).toBe(
      'Готовые фразы для комментария при проверке.',
    );
  });

  it('0 — честное «пока нет», не «0 заготовок» (чистая база)', () => {
    expect(formatGradingPresetsHint(0)).toBe(
      'Пока нет заготовок — добавьте первую на карточке проверки.',
    );
  });

  it('1 — единственное число', () => {
    expect(formatGradingPresetsHint(1)).toBe('1 заготовка для комментария.');
  });

  it('3 — «few»', () => {
    expect(formatGradingPresetsHint(3)).toBe('3 заготовки для комментария.');
  });

  it('5 — «many»', () => {
    expect(formatGradingPresetsHint(5)).toBe('5 заготовок для комментария.');
  });
});
