import { describe, expect, it } from 'vitest';
import type { AttemptBlockDto, ExamAttemptDto } from '@xuanxue/shared';
import { collectSubmittedBlocks } from './attemptSubmittedBlocks';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
    ...overrides,
  };
}

describe('collectSubmittedBlocks', () => {
  it('вопросы идут в порядке снимка, с ответами ученика', () => {
    const blocks: AttemptBlockDto[] = [
      {
        id: 'b1',
        title: 'Теория',
        questions: [
          {
            itemId: 'q1',
            version: 1,
            kind: 'text',
            prompt: 'Первый вопрос',
            options: [],
          },
          {
            itemId: 'q2',
            version: 1,
            kind: 'single',
            prompt: 'Второй вопрос',
            options: [],
          },
        ],
      },
    ];
    const attempt = makeAttempt({
      blocks,
      answers: [
        { itemId: 'q1', text: 'Мой ответ' },
        { itemId: 'q2', optionIds: ['o1'] },
      ],
    });

    const result = collectSubmittedBlocks(attempt);

    expect(result).toHaveLength(1);
    expect(result[0]?.questions).toEqual([
      {
        question: blocks[0]?.questions[0],
        index: 0,
        answer: { itemId: 'q1', text: 'Мой ответ' },
      },
      {
        question: blocks[0]?.questions[1],
        index: 1,
        answer: { itemId: 'q2', optionIds: ['o1'] },
      },
    ]);
  });

  it('видео-вопрос выброшен, но номера остальных не сдвинулись', () => {
    const blocks: AttemptBlockDto[] = [
      {
        id: 'b1',
        title: '',
        questions: [
          { itemId: 'q1', version: 1, kind: 'text', prompt: 'Текстовый', options: [] },
          {
            itemId: 'q2',
            version: 1,
            kind: 'video',
            prompt: 'Видео-вопрос',
            options: [],
          },
          {
            itemId: 'q3',
            version: 1,
            kind: 'text',
            prompt: 'Ещё текстовый',
            options: [],
          },
        ],
      },
    ];
    const attempt = makeAttempt({ blocks });

    const result = collectSubmittedBlocks(attempt);

    expect(
      result[0]?.questions.map((q) => ({ itemId: q.question.itemId, index: q.index })),
    ).toEqual([
      { itemId: 'q1', index: 0 },
      { itemId: 'q3', index: 2 },
    ]);
  });

  it('блок из одних видео-вопросов не возвращается', () => {
    const blocks: AttemptBlockDto[] = [
      {
        id: 'b1',
        title: 'Видео',
        questions: [
          {
            itemId: 'q1',
            version: 1,
            kind: 'video',
            prompt: 'Покажите форму',
            options: [],
          },
        ],
      },
      {
        id: 'b2',
        title: 'Теория',
        questions: [
          { itemId: 'q2', version: 1, kind: 'text', prompt: 'Текстовый', options: [] },
        ],
      },
    ];
    const attempt = makeAttempt({ blocks });

    const result = collectSubmittedBlocks(attempt);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('b2');
  });

  it('вопрос без ответа приходит с answer: undefined', () => {
    const blocks: AttemptBlockDto[] = [
      {
        id: 'b1',
        title: '',
        questions: [
          { itemId: 'q1', version: 1, kind: 'text', prompt: 'Текстовый', options: [] },
        ],
      },
    ];
    const attempt = makeAttempt({ blocks, answers: [] });

    const result = collectSubmittedBlocks(attempt);

    expect(result[0]?.questions[0]?.answer).toBeUndefined();
  });

  it('пустые блоки — пустой массив', () => {
    expect(collectSubmittedBlocks(makeAttempt({ blocks: [] }))).toEqual([]);
  });
});
