import { describe, expect, it } from 'vitest';
import { formatExamItemMeta } from './examItemLabels';

describe('formatExamItemMeta', () => {
  it('без тегов — только тип вопроса', () => {
    expect(formatExamItemMeta({ kind: 'video', tags: [] })).toBe('Видео');
  });

  it('с тегами — тип и теги через разделитель', () => {
    expect(formatExamItemMeta({ kind: 'single', tags: ['дыхание', 'стойки'] })).toBe(
      'Один правильный вариант · дыхание, стойки',
    );
  });
});
