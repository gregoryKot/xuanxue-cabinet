// Человеческий текст статистики вопроса (ТЗ 4.8) — чистые функции, юнит-тест
// без DOM (CLAUDE.md «Тесты»). pluralRu — общий примитив склонения
// (shared/src/plural-ru.ts), по образцу grading/gradingQueueHint.ts.
import { formatOptionLabel, pluralRu, type ExamItemStatsDto } from '@xuanxue/shared';

const TIMES_FORMS = { one: 'раз', few: 'раза', many: 'раз', other: 'раза' };

// Тип варианта не экспортирован отдельно из shared/src/index.ts (файл-
// баррель и так растёт с каждым слоем, CLAUDE.md «Файлы») — выводится из
// формы `ExamItemStatsDto.options`, один источник вместо двух.
type ExamItemOptionStatsDto = NonNullable<ExamItemStatsDto['options']>[number];

/** Вопрос, который ещё никто не видел, — честный текст, не «0/NaN»
 * (CLAUDE.md, раздел «Продукт»: чистая база — «пока нечего показать»). */
export const NEVER_ASKED_MESSAGE = 'Этот вопрос ещё никому не задавали.';

/**
 * Сколько раз задавали и (если применимо) сколько раз ответили верно. У
 * вопроса без вариантов (текст, видео) `correctCount` — `undefined`
 * (shared/src/exam-item-stats.ts): фраза про «верно» тогда не появляется,
 * автоматическая проверка для таких вопросов не выдумывается.
 */
export function formatAskedSummary(stats: ExamItemStatsDto): string {
  if (stats.askedCount === 0) return NEVER_ASKED_MESSAGE;
  const base = `Задавали ${stats.askedCount} ${pluralRu(stats.askedCount, TIMES_FORMS)}`;
  if (stats.correctCount === undefined) return `${base}.`;
  return `${base}, верно ответили ${stats.correctCount}.`;
}

// Аудит 2026-10-01, F62: вариант заменили или удалили после сдач — его
// выборы не пропадают, а строка говорит, что в вопросе его больше нет.
const REMOVED_OPTION_SUFFIX = ' В вопросе этого варианта больше нет.';

/** Строка про один вариант — сколько раз выбрали, с пометкой верного.
 * `index` — для подписи варианта без текста (formatOptionLabel, ADR-0035):
 * «Вариант N», как на экране сдачи и в карточке проверки, не пустые кавычки. */
export function formatOptionLine(option: ExamItemOptionStatsDto, index: number): string {
  const times = `${option.chosenCount} ${pluralRu(option.chosenCount, TIMES_FORMS)}`;
  const correct = option.correct ? ' Верный вариант.' : '';
  const removed = option.removed ? REMOVED_OPTION_SUFFIX : '';
  return `«${formatOptionLabel(option.text, index)}» — выбрали ${times}.${correct}${removed}`;
}

// Прописной падеж не меняется по числу («в двух экзаменах», «в пяти
// экзаменах») — pluralRu тут не нужен, только «один» против «больше одного».
const EXAM_NOUN = { one: 'экзамене', many: 'экзаменах' };

/**
 * В скольких неархивированных экзаменах вопрос стоит — предупреждение
 * заранее (аудит 2026-09-15, п.3): удалить или заархивировать такой вопрос
 * нельзя, API откажет с названиями этих форм. Вопрос нигде не стоит — `null`,
 * нечего показывать (CLAUDE.md «Продукт»: пусто, не «0 экзаменов»).
 */
export function formatUsageSummary(stats: ExamItemStatsDto): string | null {
  if (stats.usedInExamsCount === 0) return null;
  const noun = stats.usedInExamsCount === 1 ? EXAM_NOUN.one : EXAM_NOUN.many;
  return `Стоит в ${stats.usedInExamsCount} ${noun} — нельзя удалить или заархивировать, не убрав его оттуда.`;
}

// ADR-0146: вариант ни разу не выбирали — знаменатель 0, честный текст, не
// «0 из 0» (CLAUDE.md «Продукт»: пустая база — «пока нечего показать»).
export const REASON_NOT_ANSWERED_MESSAGE =
  'Объяснений пока нет: вариант ещё никто не выбирал.';

/**
 * «Объяснили выбор: 12 из 15» — только у вопроса с askReason: `reasonCount`/
 * `reasonAnsweredCount` в DTO присутствуют ровно тогда (shared/src/
 * exam-item-stats.ts). Знаменатель — сколько раз вообще выбрали вариант, не
 * `askedCount`: пропустивший вопрос целиком объяснять ничего не был должен.
 */
export function formatReasonSummary(stats: ExamItemStatsDto): string | null {
  if (stats.reasonCount === undefined || stats.reasonAnsweredCount === undefined) {
    return null;
  }
  if (stats.reasonAnsweredCount === 0) return REASON_NOT_ANSWERED_MESSAGE;
  return `Объяснили выбор: ${stats.reasonCount} из ${stats.reasonAnsweredCount}.`;
}
