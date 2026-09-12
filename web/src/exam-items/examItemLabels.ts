// Подписи типа и статуса вопроса — один источник для карточки списка, формы
// и фильтров (CLAUDE.md «Без магических чисел и строк»), по образцу
// broadcasts/broadcastLabels.ts.
import type { ExamItemKind, ExamItemStatus } from '@xuanxue/shared';

export const EXAM_ITEM_KIND_LABELS_RU: Record<ExamItemKind, string> = {
  text: 'Текстовый ответ',
  single: 'Один правильный вариант',
  multiple: 'Несколько правильных вариантов',
  video: 'Видео-ответ',
};

export const EXAM_ITEM_STATUS_LABELS_RU: Record<ExamItemStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве',
};
