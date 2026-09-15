import { describe, expect, it } from 'vitest';
import type { ExamBlockDto, ExamDto } from '@xuanxue/shared';
import { countQuestions, formatExamListMeta } from './examCounts';

function block(itemIds: string[], overrides: Partial<ExamBlockDto> = {}): ExamBlockDto {
  return { id: 'b1', title: '', itemIds, shuffle: false, ...overrides };
}

function exam(
  overrides: Partial<ExamDto> = {},
): Pick<ExamDto, 'blocks' | 'attemptsAllowed' | 'timeLimitMin'> {
  return { blocks: [], attemptsAllowed: 1, timeLimitMin: undefined, ...overrides };
}

describe('countQuestions', () => {
  it('без блоков — 0', () => {
    expect(countQuestions([])).toBe(0);
  });

  it('суммирует вопросы по всем блокам — старая многоблочная форма тоже один список', () => {
    expect(countQuestions([block(['a', 'b']), block(['c'])])).toBe(3);
  });
});

describe('formatExamListMeta', () => {
  it('пустой экзамен — честный текст, попытка и лимит остаются', () => {
    expect(formatExamListMeta(exam())).toBe(
      'Пока без вопросов · 1 попытка · без ограничения',
    );
  });

  it('один вопрос, одна попытка — единственное число всех слов', () => {
    expect(formatExamListMeta(exam({ blocks: [block(['a'])] }))).toBe(
      '1 вопрос · 1 попытка · без ограничения',
    );
  });

  it('вопросы из нескольких блоков складываются в одно число, блоков в строке нет', () => {
    expect(
      formatExamListMeta(
        exam({ blocks: [block(['a', 'b']), block(['c', 'd', 'e'])], attemptsAllowed: 2 }),
      ),
    ).toBe('5 вопросов · 2 попытки · без ограничения');
  });

  it('пять и больше попыток — «попыток»', () => {
    expect(formatExamListMeta(exam({ attemptsAllowed: 5 }))).toBe(
      'Пока без вопросов · 5 попыток · без ограничения',
    );
  });

  it('есть лимит времени — общий форматтер минут/часов', () => {
    expect(formatExamListMeta(exam({ timeLimitMin: 90 }))).toBe(
      'Пока без вопросов · 1 попытка · 1,5 часа',
    );
  });

  it('блок без вопросов — тот же честный текст, что и у формы без блоков', () => {
    expect(formatExamListMeta(exam({ blocks: [block([])] }))).toBe(
      'Пока без вопросов · 1 попытка · без ограничения',
    );
  });
});
