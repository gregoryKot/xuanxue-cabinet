// Подписи типа и статуса вопроса — один источник для карточки списка, формы
// и фильтров (CLAUDE.md «Без магических чисел и строк»), по образцу
// broadcasts/broadcastLabels.ts. Подписи статуса общие с формой экзамена (тот
// же набор статусов, exams/ExamCard.tsx и другие) — lib/statusTransitions.ts,
// здесь только реэкспорт под именем этого домена.
import type { ExamItemKind } from '@xuanxue/shared';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';

export const EXAM_ITEM_KIND_LABELS_RU: Record<ExamItemKind, string> = {
  text: 'Текстовый ответ',
  single: 'Один правильный вариант',
  multiple: 'Несколько правильных вариантов',
  video: 'Видео-ответ',
};

export const EXAM_ITEM_STATUS_LABELS_RU = DRAFT_PUBLISHED_ARCHIVED_LABELS_RU;
