// Число сданных работ, ждущих проверки, — подпись карточки-входа в раздел
// (CLAUDE.md «Продуктовая фича = число в своём разделе», ExamsScreen.tsx):
// на пустой базе честный текст, не «0 работ». `null` — число ещё не пришло
// (список грузится или упал) — подпись тогда без числа, чтобы не мигать
// нулём перед настоящим значением. pluralRu — общий примитив склонения
// (shared/src/plural-ru.ts), по образцу exams/examCounts.ts.
import { pluralRu } from '@xuanxue/shared';

const WORK_FORMS = { one: 'работа', few: 'работы', many: 'работ', other: 'работы' };
const WAIT_VERB_FORMS = { one: 'ждёт', few: 'ждут', many: 'ждут', other: 'ждут' };

export function formatGradingQueueHint(count: number | null): string {
  if (count === null) return 'Сданные работы, которые ждут вашей оценки.';
  if (count === 0) return 'Пока нечего проверять.';
  return (
    `${count} ${pluralRu(count, WORK_FORMS)} ` +
    `${pluralRu(count, WAIT_VERB_FORMS)} проверки.`
  );
}

/** Подпись рядом с числом на «Экзаменах» (ExamsSectionStats.tsx) — число
 * показано отдельно крупной цифрой, здесь только пояснение, чьи это работы. */
export function formatGradingQueueCountLabel(count: number): string {
  return `${pluralRu(count, WORK_FORMS)} учеников`;
}
