import { describe, expect, it } from 'vitest';
import {
  findMissingReasonNumbers,
  formatMissingReasonMessage,
  isReasonMissing,
} from './exam-attempt-reason';

function question(overrides: Partial<Parameters<typeof isReasonMissing>[0]> = {}) {
  return {
    itemId: 'q1',
    askReason: true,
    kind: 'single' as const,
    ...overrides,
  };
}

describe('isReasonMissing', () => {
  it('не требует объяснения, если флаг не стоит', () => {
    expect(
      isReasonMissing(question({ askReason: false }), { itemId: 'q1', optionIds: ['a'] }),
    ).toBe(false);
  });

  it('не требует объяснения у текстового/видео вопроса', () => {
    expect(
      isReasonMissing(question({ kind: 'text' }), { itemId: 'q1', text: 'ответ' }),
    ).toBe(false);
  });

  it('вопрос пропущен целиком — объяснение не требуется', () => {
    expect(isReasonMissing(question(), undefined)).toBe(false);
    expect(isReasonMissing(question(), { itemId: 'q1' })).toBe(false);
  });

  it('выбран вариант, но текст пуст или из пробелов — отказ', () => {
    expect(isReasonMissing(question(), { itemId: 'q1', optionIds: ['a'] })).toBe(true);
    expect(
      isReasonMissing(question(), { itemId: 'q1', optionIds: ['a'], text: '   ' }),
    ).toBe(true);
  });

  it('выбран вариант и написано объяснение — пропуска нет', () => {
    expect(
      isReasonMissing(question(), {
        itemId: 'q1',
        optionIds: ['a'],
        text: 'потому что',
      }),
    ).toBe(false);
  });
});

describe('findMissingReasonNumbers', () => {
  it('считает сквозной 1-based номер по блокам', () => {
    const blocks = [
      { questions: [question({ itemId: 'a', askReason: false })] },
      {
        questions: [question({ itemId: 'b' }), question({ itemId: 'c' })],
      },
    ];
    const answers = [
      { itemId: 'b', optionIds: ['x'] },
      { itemId: 'c', optionIds: ['y'], text: 'причина' },
    ];
    expect(findMissingReasonNumbers(blocks, answers)).toEqual([2]);
  });

  it('принимает плоский список вопросов тем же результатом', () => {
    const flat = [question({ itemId: 'b' })];
    expect(findMissingReasonNumbers(flat, [{ itemId: 'b', optionIds: ['x'] }])).toEqual([
      1,
    ]);
  });
});

describe('formatMissingReasonMessage', () => {
  it('один вопрос — единственное число', () => {
    expect(formatMissingReasonMessage([3])).toBe(
      'Объясните свой ответ в вопросе 3 — без объяснения работу не отправить.',
    );
  });

  it('несколько вопросов — множественное число и список через запятую', () => {
    expect(formatMissingReasonMessage([2, 5])).toBe(
      'Объясните свой ответ в вопросах 2, 5 — без объяснения работу не отправить.',
    );
  });
});
