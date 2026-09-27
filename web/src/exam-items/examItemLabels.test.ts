import { describe, expect, it } from 'vitest';
import { formatExamItemMeta } from './examItemLabels';

describe('formatExamItemMeta', () => {
  it('возвращает тип вопроса', () => {
    expect(formatExamItemMeta({ kind: 'video' })).toBe('Видео');
    expect(formatExamItemMeta({ kind: 'single' })).toBe('Один правильный вариант');
  });

  // Вопрос удалён из списка вопросов, но ещё стоит в экзамене (ADR-0140).
  it('deletedAt задан — суффикс «удалён из списка вопросов»', () => {
    expect(formatExamItemMeta({ kind: 'text', deletedAt: '2026-09-27T00:00:00Z' })).toBe(
      'Свободный ответ · удалён из списка вопросов',
    );
  });

  it('deletedAt не задан — без суффикса', () => {
    expect(formatExamItemMeta({ kind: 'text' })).toBe('Свободный ответ');
  });
});
