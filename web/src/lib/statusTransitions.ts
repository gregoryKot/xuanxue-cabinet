// Переходы draft/published/archived — один и тот же набор для вопроса банка
// (exam-items) и формы экзамена (exams, ТЗ 4.3): черновик → опубликован/архив,
// опубликован → черновик/архив, архив → только черновик (решение агента: не
// тупик — повторная публикация проходит через новый просмотр содержимого, а
// не случайный клик). Вынесено сюда, а не оставлено внутри exam-items, чтобы
// exams не копировал таблицу переходов (CLAUDE.md «Одна механика — один
// компонент», jscpd).
export type DraftPublishedArchivedStatus = 'draft' | 'published' | 'archived';

export interface StatusTransition<TStatus extends string> {
  label: string;
  nextStatus: TStatus;
}

const TRANSITIONS: Record<
  DraftPublishedArchivedStatus,
  StatusTransition<DraftPublishedArchivedStatus>[]
> = {
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

export function draftPublishedArchivedTransitions(
  status: DraftPublishedArchivedStatus,
): StatusTransition<DraftPublishedArchivedStatus>[] {
  return TRANSITIONS[status];
}

export const DRAFT_PUBLISHED_ARCHIVED_LABELS_RU: Record<
  DraftPublishedArchivedStatus,
  string
> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве',
};
