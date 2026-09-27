// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»): маппер
// снимка попытки в ExamAttemptDto, обязательный инвариант ТЗ 4.4 (correct не
// покидает файл) проверен e2e (exam-attempts.e2e-spec.ts); здесь — то, что
// юнит-тесту не нужна база — картинка варианта (ADR-0035) доезжает до DTO.
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
    videoIds: [],
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

  // ADR-0133: видео вопроса и видео варианта доезжают до DTO тем же приёмом.
  it('видео вопроса и видео варианта доезжают до DTO', () => {
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
              prompt: 'Что не так на видео?',
              videoUrl: 'https://youtu.be/x',
              options: [
                { id: 'o1', text: '', correct: true, videoId: 'opt-vid' },
                { id: 'o2', text: 'без видео', correct: false },
              ],
            },
          ],
        },
      ],
    });

    const dto = toAttemptDto(doc);

    const question = dto.blocks[0]?.questions[0];
    expect(question?.videoUrl).toBe('https://youtu.be/x');
    expect(question?.options[0]?.videoId).toBe('opt-vid');
    expect(question?.options[1]).not.toHaveProperty('videoId');
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
