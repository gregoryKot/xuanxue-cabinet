// Юнит без DOM (CLAUDE.md «Чистая логика») — collectVideoQuestions отдаёт
// video-вопросы попытки с их индексом внутри своего блока: AttemptSubmittedVideos.tsx
// должен показать тот же номер, что ученик видел на форме сдачи
// (AttemptBlock.tsx нумерует вопросы внутри блока, не сквозным счётом).
import { describe, expect, it } from 'vitest';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import { collectVideoQuestions } from './attemptVideoQuestions';

function makeQuestion(overrides: Partial<AttemptQuestionDto> = {}): AttemptQuestionDto {
  return {
    itemId: 'q1',
    version: 1,
    kind: 'text',
    prompt: 'Вопрос',
    options: [],
    ...overrides,
  };
}

function makeAttempt(blocks: ExamAttemptDto['blocks']): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'in_progress',
    blocks,
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
  };
}

describe('collectVideoQuestions', () => {
  it('пустая попытка — пустой список', () => {
    expect(collectVideoQuestions(makeAttempt([]))).toEqual([]);
  });

  it('вопросы других типов не попадают в список', () => {
    const attempt = makeAttempt([
      {
        id: 'b1',
        title: 'Теория',
        questions: [
          makeQuestion({ itemId: 'q1', kind: 'single' }),
          makeQuestion({ itemId: 'q2', kind: 'text' }),
        ],
      },
    ]);

    expect(collectVideoQuestions(attempt)).toEqual([]);
  });

  it('два блока, видео-вопросы на разных позициях — индекс свой в каждом блоке, порядок как в снимке', () => {
    const videoQ3 = makeQuestion({
      itemId: 'q3',
      kind: 'video',
      prompt: 'Покажите форму',
    });
    const videoQ5 = makeQuestion({
      itemId: 'q5',
      kind: 'video',
      prompt: 'Покажите второй раздел',
    });
    const attempt = makeAttempt([
      {
        id: 'b1',
        title: 'Теория',
        questions: [
          makeQuestion({ itemId: 'q1', kind: 'single' }),
          makeQuestion({ itemId: 'q2', kind: 'text' }),
          videoQ3,
        ],
      },
      {
        id: 'b2',
        title: 'Практика',
        questions: [videoQ5, makeQuestion({ itemId: 'q6', kind: 'text' })],
      },
    ]);

    const result = collectVideoQuestions(attempt);

    expect(result).toEqual([
      { question: videoQ3, index: 2 },
      { question: videoQ5, index: 0 },
    ]);
  });
});
