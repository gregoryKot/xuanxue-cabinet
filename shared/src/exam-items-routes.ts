// Записи карты маршрутов (api-routes.ts, ADR-0148) — вопросы экзаменов
// (ADR-0033, ADR-0141). Записи редактора — общий useEntityEditor, `POST /exam-
// items/bulk-delete` — useBulkDelete.
import type { CreateExamItemInput, ExamItemDto, UpdateExamItemInput } from './exam-items';
import type { BulkDeleteInput, BulkDeleteResult } from './bulk-delete';

export interface ExamItemsRoutes {
  'GET /exam-items/:id': { query: undefined; body: undefined; response: ExamItemDto };
  'POST /exam-items': {
    query: undefined;
    body: CreateExamItemInput;
    response: ExamItemDto;
  };
  'PATCH /exam-items/:id': {
    query: undefined;
    body: UpdateExamItemInput;
    response: ExamItemDto;
  };
  'DELETE /exam-items/:id': { query: undefined; body: undefined; response: void };
  'POST /exam-items/bulk-delete': {
    query: undefined;
    body: BulkDeleteInput;
    response: BulkDeleteResult;
  };
}

export const EXAM_ITEMS_ROUTE_KEYS: Record<keyof ExamItemsRoutes, true> = {
  'GET /exam-items/:id': true,
  'POST /exam-items': true,
  'PATCH /exam-items/:id': true,
  'DELETE /exam-items/:id': true,
  'POST /exam-items/bulk-delete': true,
};
