// Юнит-тест форматирования итога импорта экзамена — чистая логика, без Nest
// и без Mongo (CLAUDE.md «Тесты»).
import { formatExamSeedReport } from './seed-exam-report';
import type { ExamSeedReport } from './seed-exam.service';

function report(overrides: Partial<ExamSeedReport> = {}): ExamSeedReport {
  return {
    examTitle: 'Форма 1',
    examCreated: true,
    createdQuestions: [],
    skippedQuestions: [],
    uploadedImages: 0,
    ...overrides,
  };
}

describe('formatExamSeedReport', () => {
  it('новая форма, пропущено 0 — без «(уже есть)»', () => {
    const text = formatExamSeedReport(
      report({ examCreated: true, createdQuestions: ['А', 'Б'], uploadedImages: 4 }),
    );

    expect(text).toBe(
      'Экзамен «Форма 1»: создан черновиком.\n' +
        'Вопросов создано 2, пропущено 0.\n' +
        'Картинок загружено 4.',
    );
  });

  it('форма уже была, пропущено больше 0 — с «(уже есть)» и названиями', () => {
    const text = formatExamSeedReport(
      report({ examCreated: false, skippedQuestions: ['А', 'Б'], uploadedImages: 0 }),
    );

    expect(text).toBe(
      'Экзамен «Форма 1»: уже был, обновлён состав вопросов.\n' +
        'Вопросов создано 0, пропущено 2 (уже есть): А, Б.\n' +
        'Картинок загружено 0.',
    );
  });
});
