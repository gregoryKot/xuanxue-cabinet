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

/** Что значит тип — одной строкой под переключателями: выбирают его один раз
 * и навсегда, а по названию не всегда понятно, кто проверяет ответ. */
export const EXAM_ITEM_KIND_HINTS_RU: Record<ExamItemKind, string> = {
  text: 'Ответ своими словами — читаете и оцениваете вы.',
  single: 'Один вариант из списка. Сверяется сам.',
  multiple: 'Несколько верных вариантов сразу, сверяются автоматически.',
  video: 'Видеозапись задания — вы смотрите её и ставите оценку.',
};

export const EXAM_ITEM_STATUS_LABELS_RU = DRAFT_PUBLISHED_ARCHIVED_LABELS_RU;

/** Служебная строка под формулировкой вопроса — тип и теги через « · »
 * (макет Form.dc.html). Один форматтер на список вопросов, список вопросов
 * экзамена и поиск рядом с ним: три строки одного вида в соседних
 * файлах разошлись бы при первой правке (CLAUDE.md «Одна механика — один
 * компонент»). */
export function formatExamItemMeta(item: Pick<ExamItemDto, 'kind' | 'tags'>): string {
  const kind = EXAM_ITEM_KIND_LABELS_RU[item.kind];
  return item.tags.length > 0 ? `${kind} · ${item.tags.join(', ')}` : kind;
}
