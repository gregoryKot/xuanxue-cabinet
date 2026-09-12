// Переходы статуса вопроса — кнопками, а не выпадающим списком (ТЗ 4.2,
// «Лист»). Таблица переходов общая с формой экзамена (те же три статуса,
// exams/ExamStatusControls.tsx) — вынесена в lib/statusTransitions.ts, здесь
// только типизация под ExamItemStatus (CLAUDE.md «Дубли»).
import type { ExamItemStatus } from '@xuanxue/shared';
import {
  draftPublishedArchivedTransitions,
  type StatusTransition,
} from '../lib/statusTransitions';

export type ExamItemStatusAction = StatusTransition<ExamItemStatus>;

export function examItemStatusActions(status: ExamItemStatus): ExamItemStatusAction[] {
  return draftPublishedArchivedTransitions(status);
}
