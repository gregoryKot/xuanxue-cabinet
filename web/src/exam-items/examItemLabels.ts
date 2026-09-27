// Подписи типа и статуса вопроса — один источник для строки списка, страницы
// вопроса и служебной строки под формулировкой (CLAUDE.md «Без магических
// чисел и строк»). Подписи статуса общие с формой экзамена (тот же набор
// статусов) — lib/statusTransitions.ts, здесь только реэкспорт под именем
// этого домена.
import type { ExamItemDto, ExamItemKind, PluralForms } from '@xuanxue/shared';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';

// Подписи короткие: они стоят переключателями в одну строку на 360 px
// (ExamItemKindField.tsx) и служебной строкой под формулировкой в списках —
// «Несколько правильных вариантов» там переносилось на вторую строку.
export const EXAM_ITEM_KIND_LABELS_RU: Record<ExamItemKind, string> = {
  text: 'Свободный ответ',
  single: 'Один правильный вариант',
  multiple: 'Несколько правильных',
  video: 'Видео',
};

export const EXAM_ITEM_STATUS_LABELS_RU = DRAFT_PUBLISHED_ARCHIVED_LABELS_RU;

/** Служебная строка под формулировкой вопроса — тип вопроса (макет
 * Form.dc.html). Тег вопроса убран из продукта (ADR-0128) — строка теперь
 * несёт только тип; один форматтер на список вопросов и поиск рядом с ним,
 * чтобы не разойтись при первой правке (CLAUDE.md «Одна механика — один
 * компонент»). Вопрос, удалённый из банка (ADR-0140), но ещё стоящий в
 * экзамене (ExamQuestionList.tsx), несёт суффикс — поиск (ExamQuestionSearch.tsx)
 * такой вопрос не показывает вовсе, поэтому там суффикс никогда не появится. */
const DELETED_FROM_BANK_SUFFIX = ' · удалён из списка вопросов';

export function formatExamItemMeta(
  item: Pick<ExamItemDto, 'kind' | 'deletedAt'>,
): string {
  const kind = EXAM_ITEM_KIND_LABELS_RU[item.kind];
  return item.deletedAt ? `${kind}${DELETED_FROM_BANK_SUFFIX}` : kind;
}

/** Склонение «вопрос/вопроса/вопросов» для массового удаления
 * (lib/bulkDeleteText.ts, ADR-0141) — своя константа, не импорт
 * `QUESTION_FORMS` из exams/examCounts.ts: там то же слово считает вопросы
 * ВНУТРИ экзамена, и обратный импорт (exam-items → exams) завёл бы цикл —
 * exams уже читает из exam-items (examImagesSummaryText.ts и другие). */
export const EXAM_ITEM_NOUN_FORMS: PluralForms = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};

/** Текст подтверждения массового удаления (ExamItemsScreen.tsx,
 * BulkDeleteBar.tsx) — своя формулировка последствия для вопросов: удаление
 * мягкое (ADR-0140), вопрос уходит из списка, но не из экзаменов, где уже
 * стоит, — иначе там, где он использован, тихо осталась бы дырка. «Банк» —
 * слово разработчика (ADR-0040, check-robot-phrases.mjs), пользователю раздел
 * называется «Вопросы». */
export const EXAM_ITEM_BULK_DELETE_MESSAGE =
  'Вопросы пропадут из списка. В экзаменах, где они уже стоят, **останутся** — уберите их оттуда, если нужно.';
