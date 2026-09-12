// Переходы статуса вопроса — кнопками, а не выпадающим списком (ТЗ 4.2,
// «Лист»): у каждого статуса свой набор, не «все статусы минус текущий».
// Архивный вопрос возвращается только в черновик — повторная публикация
// проходит через новый просмотр содержимого, а не случайный клик (решение
// агента: в ТЗ прямо не описано, но иначе архивный вопрос был бы тупиком).
import type { ExamItemStatus } from '@xuanxue/shared';

export interface ExamItemStatusAction {
  label: string;
  nextStatus: ExamItemStatus;
}

const ACTIONS_BY_STATUS: Record<ExamItemStatus, ExamItemStatusAction[]> = {
  draft: [
    { label: 'Опубликовать', nextStatus: 'published' },
    { label: 'В архив', nextStatus: 'archived' },
  ],
  published: [
    { label: 'Вернуть в черновик', nextStatus: 'draft' },
    { label: 'В архив', nextStatus: 'archived' },
  ],
  archived: [{ label: 'Вернуть в черновик', nextStatus: 'draft' }],
};

export function examItemStatusActions(status: ExamItemStatus): ExamItemStatusAction[] {
  return ACTIONS_BY_STATUS[status];
}
