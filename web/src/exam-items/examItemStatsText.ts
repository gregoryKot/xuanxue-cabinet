// Человеческий текст статистики вопроса (ТЗ 4.8) — чистые функции, юнит-тест
// без DOM (CLAUDE.md «Тесты»). pluralRu — общий примитив склонения
// (shared/src/plural-ru.ts), по образцу grading/gradingQueueHint.ts.
import { pluralRu, type ExamItemStatsDto } from '@xuanxue/shared';

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

/** Строка про один вариант — сколько раз выбрали, с пометкой верного. */
export function formatOptionLine(option: ExamItemOptionStatsDto): string {
  const times = `${option.chosenCount} ${pluralRu(option.chosenCount, TIMES_FORMS)}`;
  const suffix = option.correct ? ' Верный вариант.' : '';
  return `«${option.text}» — выбрали ${times}.${suffix}`;
}
