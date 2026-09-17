// Подпись карточки-ссылки «Вопросы» на «Экзаменах» (CLAUDE.md «Продуктовая
// фича = число в своём разделе», ExamsScreen.tsx) — по образцу
// grading/gradingQueueHint.ts. `null` — число ещё не пришло (грузится или
// сбой) или его просто нет — тогда только объяснение раздела, без «0».
// pluralRu — общий примитив склонения (shared/src/plural-ru.ts); глагол
// склоняется тем же приёмом, что WAIT_VERB_FORMS в gradingQueueHint.ts.
import { pluralRu } from '@xuanxue/shared';

export const EXAM_ITEMS_LINK_BASE_HINT =
  'Из них собирается экзамен — один вопрос можно поставить в несколько экзаменов.';

const ITEM_FORMS = { one: 'вопрос', few: 'вопроса', many: 'вопросов', other: 'вопроса' };
const CONFUSE_VERB_FORMS = {
  one: 'путает',
  few: 'путают',
  many: 'путают',
  other: 'путают',
};

export function formatExamItemsLinkHint(strugglingCount: number | null): string {
  if (!strugglingCount) return EXAM_ITEMS_LINK_BASE_HINT;
  return (
    `${EXAM_ITEMS_LINK_BASE_HINT} ${strugglingCount} ` +
    `${pluralRu(strugglingCount, ITEM_FORMS)} ` +
    `${pluralRu(strugglingCount, CONFUSE_VERB_FORMS)} больше половины ответивших.`
  );
}
