// Кого считаем «без ответа» перед отправкой (просьба владельца 2026-09-22) —
// без DOM: правило одно и то же и для подсветки строки, и для текста
// подтверждения.
import { describe, expect, it } from 'vitest';
import type { AttemptAnswerDto, AttemptBlockDto, ExamMediaDto } from '@xuanxue/shared';
import { collectUnansweredIds, formatUnansweredConfirm } from './attemptUnanswered';

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
      },
      { itemId: 'q2', version: 1, kind: 'text', prompt: 'Опишите дыхание', options: [] },
    ],
  },
  {
    id: 'b2',
    title: 'Практика',
    questions: [
      { itemId: 'q3', version: 1, kind: 'video', prompt: 'Покажите форму', options: [] },
    ],
  },
];

function answersOf(...list: AttemptAnswerDto[]) {
  const map = new Map(list.map((answer) => [answer.itemId, answer]));
  return (itemId: string) => map.get(itemId);
}

function mediaOf(itemId: string | undefined): ExamMediaDto[] {
  return [
    {
      id: 'm1',
      attemptId: 'a1',
      itemId,
      kind: 'telegram',
      receivedAt: '2026-09-22T10:00:00Z',
    },
  ];
}

describe('collectUnansweredIds', () => {
  it('пустая попытка — без ответа все вопросы, в порядке блоков', () => {
    expect(collectUnansweredIds(blocks, answersOf(), [])).toEqual(['q1', 'q2', 'q3']);
  });

  it('выбранный вариант и непустой текст закрывают вопрос', () => {
    const getAnswer = answersOf(
      { itemId: 'q1', optionIds: ['o1'] },
      { itemId: 'q2', text: 'Ровно и через нос' },
    );

    expect(collectUnansweredIds(blocks, getAnswer, mediaOf('q3'))).toEqual([]);
  });

  it('пробелы в тексте и пустой список вариантов ответом не считаются', () => {
    const getAnswer = answersOf(
      { itemId: 'q1', optionIds: [] },
      { itemId: 'q2', text: '   ' },
    );

    expect(collectUnansweredIds(blocks, getAnswer, [])).toEqual(['q1', 'q2', 'q3']);
  });

  it('видео закрывает свой вопрос, а не чужой', () => {
    expect(collectUnansweredIds(blocks, answersOf(), mediaOf('q9'))).toContain('q3');
    expect(collectUnansweredIds(blocks, answersOf(), mediaOf('q3'))).not.toContain('q3');
  });

  it('запись без itemId (старый инстанс, ADR-0037) видео-вопрос не закрывает', () => {
    expect(collectUnansweredIds(blocks, answersOf(), mediaOf(undefined))).toContain('q3');
  });
});

describe('formatUnansweredConfirm', () => {
  it('один вопрос — единственное число и согласование «он отмечен»', () => {
    expect(formatUnansweredConfirm(1)).toBe(
      'Без ответа 1 вопрос. Он отмечен в форме. После отправки менять ответы будет нельзя.',
    );
  });

  it('несколько вопросов — склонение и «они отмечены»', () => {
    expect(formatUnansweredConfirm(3)).toContain('3 вопроса. Они отмечены в форме');
    expect(formatUnansweredConfirm(5)).toContain('5 вопросов. Они отмечены в форме');
  });
});
