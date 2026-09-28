// Отказ отправки из-за пропущенного объяснения — без DOM (ADR-0146).
import { describe, expect, it } from 'vitest';
import type { AttemptAnswerDto, AttemptBlockDto } from '@xuanxue/shared';
import { checkMissingReasons } from './attemptReasonGuard';

const blocks: AttemptBlockDto[] = [
  {
    id: 'b1',
    title: 'Теория',
    questions: [
      {
        itemId: 'q1',
        version: 1,
        kind: 'single',
        prompt: 'Сколько стоек в форме?',
        options: [{ id: 'o1', text: 'Три' }],
        askReason: true,
      },
      { itemId: 'q2', version: 1, kind: 'text', prompt: 'Опишите дыхание', options: [] },
    ],
  },
  {
    id: 'b2',
    title: 'Практика',
    questions: [
      {
        itemId: 'q3',
        version: 1,
        kind: 'multiple',
        prompt: 'Отметьте верные утверждения',
        options: [{ id: 'o1', text: 'А' }],
        askReason: true,
      },
    ],
  },
];

function answersOf(...list: AttemptAnswerDto[]) {
  const map = new Map(list.map((answer) => [answer.itemId, answer]));
  return (itemId: string) => map.get(itemId);
}

describe('checkMissingReasons', () => {
  it('никто не выбирал вариант — объяснять нечего, null', () => {
    expect(checkMissingReasons(blocks, answersOf())).toBeNull();
  });

  it('вариант выбран, объяснение написано — null', () => {
    const getAnswer = answersOf({ itemId: 'q1', optionIds: ['o1'], text: 'Потому что' });

    expect(checkMissingReasons(blocks, getAnswer)).toBeNull();
  });

  it('вариант выбран, объяснения нет — текст отказа с номером вопроса', () => {
    const getAnswer = answersOf({ itemId: 'q1', optionIds: ['o1'] });

    expect(checkMissingReasons(blocks, getAnswer)).toBe(
      'Объясните свой ответ в вопросе 1 — без объяснения работу не отправить.',
    );
  });

  it('несколько вопросов без объяснения — оба номера в тексте отказа', () => {
    const getAnswer = answersOf(
      { itemId: 'q1', optionIds: ['o1'] },
      { itemId: 'q3', optionIds: ['o1'] },
    );

    expect(checkMissingReasons(blocks, getAnswer)).toBe(
      'Объясните свой ответ в вопросах 1, 3 — без объяснения работу не отправить.',
    );
  });

  it('вопрос пропущен целиком (вариант не выбран) — объяснение не требуется', () => {
    const getAnswer = answersOf({ itemId: 'q3', optionIds: [] });

    expect(checkMissingReasons(blocks, getAnswer)).toBeNull();
  });

  it('объяснение из пробелов — не считается написанным', () => {
    const getAnswer = answersOf({ itemId: 'q1', optionIds: ['o1'], text: '   ' });

    expect(checkMissingReasons(blocks, getAnswer)).toBe(
      'Объясните свой ответ в вопросе 1 — без объяснения работу не отправить.',
    );
  });

  it('пустая попытка (нет ответов вовсе) — null', () => {
    expect(checkMissingReasons([], answersOf())).toBeNull();
  });
});
