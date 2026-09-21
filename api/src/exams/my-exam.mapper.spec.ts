// Юнит-тест toMyExamDto — без Mongo и DI (CLAUDE.md «Тесты»).
import { Types } from 'mongoose';
import { toMyExamDto, type MyExamInput } from './my-exam.mapper';

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
