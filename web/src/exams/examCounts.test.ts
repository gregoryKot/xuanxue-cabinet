import { describe, expect, it } from 'vitest';
import type { ExamBlockDto } from '@xuanxue/shared';
import { countQuestions, formatExamContentSummary } from './examCounts';

function block(itemIds: string[], overrides: Partial<ExamBlockDto> = {}): ExamBlockDto {
  return { id: 'b1', title: '', itemIds, shuffle: false, required: false, ...overrides };
}

describe('countQuestions', () => {
  it('без блоков — 0', () => {
    expect(countQuestions([])).toBe(0);
  });

  it('суммирует вопросы по всем блокам', () => {
    expect(countQuestions([block(['a', 'b']), block(['c'])])).toBe(3);
  });
});

describe('formatExamContentSummary', () => {
  it('пустая форма — честный текст, не «0 блоков»', () => {
    expect(formatExamContentSummary([])).toBe('Пока без блоков');
  });

  it('один блок, один вопрос — единственное число обоих слов', () => {
    expect(formatExamContentSummary([block(['a'])])).toBe('1 блок · 1 вопрос');
  });

  it('несколько блоков и вопросов — склонение по pluralRu', () => {
    expect(formatExamContentSummary([block(['a', 'b']), block(['c', 'd', 'e'])])).toBe(
      '2 блока · 5 вопросов',
    );
  });

  it('блок без вопросов учитывается в числе блоков, но не вопросов', () => {
    expect(formatExamContentSummary([block([])])).toBe('1 блок · 0 вопросов');
  });
});
