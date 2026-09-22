// Юнит-тест toMyExamDto — без Mongo и DI (CLAUDE.md «Тесты»).
import { Types } from 'mongoose';
import type { LeanExamAttempt } from './exam-attempt.mapper';
import {
  toMyExamDto,
  toMyExamLastAttemptInput,
  type MyExamInput,
} from './my-exam.mapper';

function exam(overrides: Partial<MyExamInput> = {}): MyExamInput {
  return {
    _id: new Types.ObjectId(),
    title: 'Экзамен на жёлтый пояс',
    description: 'Форма и теория первого уровня',
    level: 'начальный',
    attemptsAllowed: 1,
    ...overrides,
  };
}

describe('toMyExamDto', () => {
  it('ученик ещё не начинал — attemptsUsed: 0, lastAttempt отсутствует', () => {
    const dto = toMyExamDto(exam(), 0, undefined);
    expect(dto.attemptsUsed).toBe(0);
    expect(dto.lastAttempt).toBeUndefined();
  });

  it('есть попытка — attemptsUsed и lastAttempt переданы как есть', () => {
    const dto = toMyExamDto(exam(), 1, {
      id: 'attempt-1',
      status: 'submitted',
      expired: true,
    });
    expect(dto.attemptsUsed).toBe(1);
    expect(dto.lastAttempt).toEqual({
      id: 'attempt-1',
      status: 'submitted',
      expired: true,
    });
  });

  it('оценка выставлена — outcome/comment переданы как есть (слой 4.6)', () => {
    const dto = toMyExamDto(exam(), 1, {
      id: 'attempt-1',
      status: 'graded',
      expired: false,
      outcome: 'passed',
      comment: 'Хорошая работа',
    });

    expect(dto.lastAttempt).toEqual({
      id: 'attempt-1',
      status: 'graded',
      expired: false,
      outcome: 'passed',
      comment: 'Хорошая работа',
    });
  });

  it('у формы есть лимит времени — timeLimitMin передан как есть', () => {
    const dto = toMyExamDto(exam({ timeLimitMin: 40 }), 0, undefined);
    expect(dto.timeLimitMin).toBe(40);
  });

  it('у формы нет лимита времени — timeLimitMin отсутствует', () => {
    const dto = toMyExamDto(exam(), 0, undefined);
    expect(dto.timeLimitMin).toBeUndefined();
  });

  it('у попытки есть дедлайн — deadlineAt передан в lastAttempt как есть', () => {
    const dto = toMyExamDto(exam({ timeLimitMin: 40 }), 1, {
      id: 'attempt-1',
      status: 'in_progress',
      expired: false,
      deadlineAt: '2026-09-22T16:40:00.000Z',
    });
    expect(dto.lastAttempt).toEqual({
      id: 'attempt-1',
      status: 'in_progress',
      expired: false,
      deadlineAt: '2026-09-22T16:40:00.000Z',
    });
  });

  it('у попытки нет дедлайна — deadlineAt в lastAttempt отсутствует', () => {
    const dto = toMyExamDto(exam(), 1, {
      id: 'attempt-1',
      status: 'in_progress',
      expired: false,
    });
    expect(dto.lastAttempt?.deadlineAt).toBeUndefined();
  });

  it('description/level отсутствуют в документе (после $unset) — пустая строка, не undefined', () => {
    const dto = toMyExamDto(
      exam({
        description: undefined as unknown as string,
        level: undefined as unknown as string,
      }),
      0,
      undefined,
    );
    expect(dto.description).toBe('');
    expect(dto.level).toBe('');
  });
});

// Сборка положения по последней попытке (ADR-0122) — та часть ответа
// `/me/exams`, где решается, тикает ли ещё время попытки.
function leanAttempt(overrides: Partial<LeanExamAttempt> = {}): LeanExamAttempt {
  return {
    _id: new Types.ObjectId(),
    examId: new Types.ObjectId(),
    examTitle: 'Экзамен',
    userId: new Types.ObjectId(),
    attemptNo: 1,
    status: 'in_progress',
    blocks: [],
    answers: [],
    imageIds: [],
    startedAt: new Date('2026-09-22T16:00:00.000Z'),
    expired: false,
    createdAt: new Date('2026-09-22T16:00:00.000Z'),
    updatedAt: new Date('2026-09-22T16:00:00.000Z'),
    ...overrides,
  };
}

describe('toMyExamLastAttemptInput', () => {
  it('идущая попытка — deadlineAt в ISO UTC', () => {
    const input = toMyExamLastAttemptInput(
      leanAttempt({ deadlineAt: new Date('2026-09-22T16:40:00.000Z') }),
      undefined,
    );

    expect(input.status).toBe('in_progress');
    expect(input.deadlineAt).toBe('2026-09-22T16:40:00.000Z');
  });

  // Главное здесь: у закрытой попытки отметка в записи остаётся старой, и
  // отданная наружу читалась бы кабинетом и ботом как живой дедлайн.
  it('попытка уже закрыта — deadlineAt наружу не идёт', () => {
    const input = toMyExamLastAttemptInput(
      leanAttempt({
        status: 'submitted',
        expired: true,
        deadlineAt: new Date('2026-09-22T16:40:00.000Z'),
      }),
      undefined,
    );

    expect(input.expired).toBe(true);
    expect(input.deadlineAt).toBeUndefined();
  });

  it('у формы без лимита дедлайна нет вовсе', () => {
    expect(toMyExamLastAttemptInput(leanAttempt(), undefined).deadlineAt).toBeUndefined();
  });

  // `.lean()` не переприменяет схемный default(false): у попыток старше
  // самого поля `expired` его в документе нет, а не false.
  it('поля expired в документе нет — в ответе false, не undefined', () => {
    const { expired, ...withoutExpired } = leanAttempt();
    expect(expired).toBe(false);

    expect(
      toMyExamLastAttemptInput(withoutExpired as LeanExamAttempt, undefined).expired,
    ).toBe(false);
  });
});
