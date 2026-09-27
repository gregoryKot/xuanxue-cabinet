// Подписи типа и статуса вопроса — один источник для строки списка, страницы
// вопроса и служебной строки под формулировкой (CLAUDE.md «Без магических
// чисел и строк»). Подписи статуса общие с формой экзамена (тот же набор
// статусов) — lib/statusTransitions.ts, здесь только реэкспорт под именем
// этого домена.
import type { ExamItemDto, ExamItemKind } from '@xuanxue/shared';
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
 * компонент»). */
export function formatExamItemMeta(item: Pick<ExamItemDto, 'kind'>): string {
  return EXAM_ITEM_KIND_LABELS_RU[item.kind];
}
