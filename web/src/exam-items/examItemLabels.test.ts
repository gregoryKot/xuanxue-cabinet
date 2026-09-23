import { describe, expect, it } from 'vitest';
import { formatExamItemMeta } from './examItemLabels';

describe('formatExamItemMeta', () => {
  it('возвращает тип вопроса', () => {
    expect(formatExamItemMeta({ kind: 'video' })).toBe('Видео');
    expect(formatExamItemMeta({ kind: 'single' })).toBe('Один правильный вариант');
  });
});
