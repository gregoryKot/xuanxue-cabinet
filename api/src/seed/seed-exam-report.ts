// Форматирование итога импорта экзамена — чистая логика, юнит-тест без
// Nest/Mongo (тот же принцип, что seed-report.ts: seed-exam.ts остаётся
// только bootstrap, CLAUDE.md «Логика вне контроллеров»).
import { pluralRu } from '@xuanxue/shared';
import type { ExamSeedReport } from './seed-exam.service';

// Живой прогон на форме из 56 вопросов печатал при повторном импорте все
// пропущенные формулировки одной строкой — простыня, не отчёт. Тот же приём,
// что formatExamUsageList (exam-item-references.ts): первые несколько и
// «и ещё N», не весь список.
const SKIPPED_QUESTIONS_SHOWN_LIMIT = 3;
const QUESTION_COUNT_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};

/** «А, Б, В и ещё 53 вопроса» — первые формулировки и число остальных. */
function formatSkippedQuestionsList(prompts: readonly string[]): string {
  const shown = prompts.slice(0, SKIPPED_QUESTIONS_SHOWN_LIMIT);
  const restCount = prompts.length - shown.length;
  if (restCount <= 0) return shown.join(', ');
  return `${shown.join(', ')} и ещё ${restCount} ${pluralRu(restCount, QUESTION_COUNT_FORMS)}`;
}

/** «Вопросов создано N, пропущено M (уже есть): …» — суффикс «(уже есть): …»
 * только когда правда есть что перечислить (M > 0), тот же приём, что у
 * formatSeedReport (seed-report.ts). */
export function formatExamSeedReport(report: ExamSeedReport): string {
  const examLine = report.examCreated
    ? `Экзамен «${report.examTitle}»: создан черновиком.`
    : `Экзамен «${report.examTitle}»: уже был, обновлён состав вопросов.`;

  const skippedPart =
    report.skippedQuestions.length > 0
      ? `пропущено ${report.skippedQuestions.length} (уже есть): ${formatSkippedQuestionsList(report.skippedQuestions)}`
      : `пропущено ${report.skippedQuestions.length}`;
  const questionsLine = `Вопросов создано ${report.createdQuestions.length}, ${skippedPart}.`;

  const imagesLine = `Картинок загружено ${report.uploadedImages}.`;

  return [examLine, questionsLine, imagesLine].join('\n');
}
