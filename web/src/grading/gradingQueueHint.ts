// Число сданных работ, ждущих проверки, — заголовок тёплой плашки раздела
// «Экзамены» (CLAUDE.md «Продуктовая фича = число в своём разделе»,
// ExamsSectionStats.tsx, docs/adr/0043): на пустой базе честный текст, не
// «0 работ». `null` — число ещё не пришло (список грузится или упал) —
// заголовок тогда без числа, чтобы не мигать нулём перед настоящим
// значением. pluralRu — общий примитив склонения (shared/src/plural-ru.ts),
// по образцу exams/examCounts.ts.
import { pluralRu } from '@xuanxue/shared';

const WORK_FORMS = { one: 'работа', few: 'работы', many: 'работ', other: 'работы' };
const WAIT_VERB_FORMS = { one: 'ждёт', few: 'ждут', many: 'ждут', other: 'ждут' };

/** Общее описание, зачем открывать «Проверку работ», без чисел — строка
 * объяснения экрана (GradingQueueScreen.tsx) и приписка карточки-перехода
 * «Проверка» на «Экзаменах» (exams/ExamsSectionStats.tsx, docs/adr/0043):
 * там уже стоит число очереди тёплой плашкой рядом (formatGradingQueueHint
 * выше), повторять его в приписке карточки-перехода незачем — нужен другой
 * текст, не совпадающий с плашкой при `count === null`. Константа живёт в
 * этом чистом текстовом модуле, а не в самом экране: `/exams` не должен
 * тянуть код экрана `/grading` в свой чанк (React.lazy, app/routeModules.ts). */
export const GRADING_QUEUE_EXPLANATION =
  'Работы, которые ученики уже сдали. Откройте любую, чтобы поставить итог и написать комментарий.';

export function formatGradingQueueHint(count: number | null): string {
  if (count === null) return 'Сданные работы, которые ждут вашей оценки.';
  if (count === 0) return 'Пока нечего проверять.';
  return (
    `${count} ${pluralRu(count, WORK_FORMS)} ` +
    `${pluralRu(count, WAIT_VERB_FORMS)} проверки.`
  );
}
