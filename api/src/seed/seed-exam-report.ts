// Форматирование итога импорта экзамена — чистая логика, юнит-тест без
// Nest/Mongo (тот же принцип, что seed-report.ts: seed-exam.ts остаётся
// только bootstrap, CLAUDE.md «Логика вне контроллеров»).
import type { ExamSeedReport } from './seed-exam.service';

/** «Вопросов создано N, пропущено M (уже есть): …» — суффикс «(уже есть): …»
 * только когда правда есть что перечислить (M > 0), тот же приём, что у
 * formatSeedReport (seed-report.ts). */
export function formatExamSeedReport(report: ExamSeedReport): string {
  const examLine = report.examCreated
    ? `Экзамен «${report.examTitle}»: создан черновиком.`
    : `Экзамен «${report.examTitle}»: уже был, обновлён состав вопросов.`;

  const skippedPart =
    report.skippedQuestions.length > 0
      ? `пропущено ${report.skippedQuestions.length} (уже есть): ${report.skippedQuestions.join(', ')}`
      : `пропущено ${report.skippedQuestions.length}`;
  const questionsLine = `Вопросов создано ${report.createdQuestions.length}, ${skippedPart}.`;

  const imagesLine = `Картинок загружено ${report.uploadedImages}.`;

  return [examLine, questionsLine, imagesLine].join('\n');
}
