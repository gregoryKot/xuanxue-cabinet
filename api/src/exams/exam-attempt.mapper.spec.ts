// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»): маппер
// снимка попытки в ExamAttemptDto, обязательный инвариант ТЗ 4.4 (correct/
// criteria не покидают файл) проверен e2e (exam-attempts.e2e-spec.ts); здесь —
// то, что юнит-тесту не нужна база — картинка варианта (ADR-0035) доезжает
// до DTO.
import { Types } from 'mongoose';
import type { AttemptGradingSummary } from './exam-grading-list';
import { toAttemptDto, type LeanExamAttempt } from './exam-attempt.mapper';

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
    startedAt: new Date('2026-09-12T10:00:00.000Z'),
    expired: false,
    createdAt: new Date('2026-09-12T10:00:00.000Z'),
    updatedAt: new Date('2026-09-12T10:00:00.000Z'),
    ...overrides,
  };
}

describe('toAttemptDto', () => {
  it('imageId варианта доезжает до DTO', () => {
    const doc = leanAttempt({
      blocks: [
        {
          id: 'b1',
          title: 'Форма',
          questions: [
            {
              itemId: 'i1',
              version: 1,
              kind: 'single',
              prompt: 'Какая стойка?',
              options: [
                { id: 'o1', text: '', correct: true, imageId: 'img1' },
                { id: 'o2', text: 'без картинки', correct: false },
              ],
            },
          ],
        },
      ],
    });

    const dto = toAttemptDto(doc);

    const options = dto.blocks[0]?.questions[0]?.options ?? [];
    expect(options[0]?.imageId).toBe('img1');
    expect(options[1]).not.toHaveProperty('imageId');
  });

  // Раздел «Проверенные» (PR #351, docs/PLAN.md §4.6): третий параметр
  // grading — тем же приёмом, что userName. Read-after-write и то, что оба
  // поля физически отсутствуют в ответе, проверено e2e
  // (exam-grading.e2e-spec.ts); здесь — сам маппер в изоляции, без базы.
  it('grading передан — outcome и gradedAt берутся из него', () => {
    const doc = leanAttempt();
    const grading: AttemptGradingSummary = {
      outcome: 'passed',
      gradedAt: '2026-09-20T12:00:00.000Z',
    };

    const dto = toAttemptDto(doc, undefined, grading);

    expect(dto.outcome).toBe('passed');
    expect(dto.gradedAt).toBe('2026-09-20T12:00:00.000Z');
  });

  it('grading не передан — outcome и gradedAt в DTO не приходят', () => {
    const doc = leanAttempt();

    const dto = toAttemptDto(doc);

    expect(dto.outcome).toBeUndefined();
    expect(dto.gradedAt).toBeUndefined();
  });
});
