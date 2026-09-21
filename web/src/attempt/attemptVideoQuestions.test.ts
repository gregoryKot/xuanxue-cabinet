// Юнит без DOM (CLAUDE.md «Чистая логика») — collectVideoQuestions отдаёт
// video-вопросы попытки с их индексом внутри своего блока: AttemptSubmittedVideos.tsx
// должен показать тот же номер, что ученик видел на форме сдачи
// (AttemptBlock.tsx нумерует вопросы внутри блока, не сквозным счётом).
import { describe, expect, it } from 'vitest';
import type { AttemptQuestionDto, ExamAttemptDto, ExamMediaDto } from '@xuanxue/shared';
import { awaitsVideoAnswer, collectVideoQuestions } from './attemptVideoQuestions';

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

/** `itemId` не задан по умолчанию — так тест «запись без itemId» просит
 * фикстуру без ключа вовсе, а не с явным `undefined`. */
function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    kind: 'link',
    receivedAt: '2026-09-12T16:30:00.000Z',
    ...overrides,
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

// Критерий фонового опроса (useAttemptVideoPoll.ts, ADR-0076) — тик ходит в
// сеть, только пока это `true`.
describe('awaitsVideoAnswer', () => {
  it('нет видео-вопросов — false', () => {
    expect(awaitsVideoAnswer(makeAttempt([]))).toBe(false);
  });

  it('видео-вопрос без единой записи — true', () => {
    const attempt = makeAttempt([
      { id: 'b1', title: '', questions: [makeQuestion({ itemId: 'q1', kind: 'video' })] },
    ]);

    expect(awaitsVideoAnswer(attempt)).toBe(true);
  });

  it('запись с этим itemId — false, вопрос закрыт', () => {
    const attempt = {
      ...makeAttempt([
        {
          id: 'b1',
          title: '',
          questions: [makeQuestion({ itemId: 'q1', kind: 'video' })],
        },
      ]),
      media: [makeMedia({ itemId: 'q1' })],
    };

    expect(awaitsVideoAnswer(attempt)).toBe(false);
  });

  it('запись с чужим itemId — true, свой вопрос остаётся без ответа', () => {
    const attempt = {
      ...makeAttempt([
        {
          id: 'b1',
          title: '',
          questions: [makeQuestion({ itemId: 'q1', kind: 'video' })],
        },
      ]),
      media: [makeMedia({ itemId: 'q2' })],
    };

    expect(awaitsVideoAnswer(attempt)).toBe(true);
  });

  // Оценённая попытка не ждёт ничего: открытая вкладка со старой попыткой,
  // куда видео так и не прислали, иначе опрашивала бы сервер до закрытия
  // браузера.
  it('попытка оценена — false, даже если видео так и не прислали', () => {
    const attempt: ExamAttemptDto = {
      ...makeAttempt([
        {
          id: 'b1',
          title: '',
          questions: [makeQuestion({ itemId: 'q1', kind: 'video' })],
        },
      ]),
      status: 'graded',
    };

    expect(awaitsVideoAnswer(attempt)).toBe(false);
  });

  // ADR-0037 «Последствия»: старый инстанс мог записать видео без itemId во
  // время деплоя (expand → contract) — такая запись ничей вопрос не
  // закрывает, опрос обязан продолжаться.
  it('запись без itemId — true, чужой вопрос не закрывает', () => {
    const attempt = {
      ...makeAttempt([
        {
          id: 'b1',
          title: '',
          questions: [makeQuestion({ itemId: 'q1', kind: 'video' })],
        },
      ]),
      media: [makeMedia()],
    };

    expect(awaitsVideoAnswer(attempt)).toBe(true);
  });
});
