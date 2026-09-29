// Записи карты маршрутов (api-routes.ts, ADR-0148) — экзамены (ADR-0033,
// ADR-0141). Четыре записи редактора читает и пишет общий useEntityEditor
// (web/src/hooks/useEntityEditor.ts) по коллекции; `POST /exams/bulk-delete` —
// useBulkDelete. Запись создаёт и правит ответ с DTO (ADR-0087), удаление —
// честный 204.
import type { CreateExamInput, ExamDto, UpdateExamInput } from './exams';
import type { BulkDeleteInput, BulkDeleteResult } from './bulk-delete';

export interface ExamsRoutes {
  'GET /exams/:id': { query: undefined; body: undefined; response: ExamDto };
  'POST /exams': { query: undefined; body: CreateExamInput; response: ExamDto };
  'PATCH /exams/:id': { query: undefined; body: UpdateExamInput; response: ExamDto };
  'DELETE /exams/:id': { query: undefined; body: undefined; response: void };
  'POST /exams/bulk-delete': {
    query: undefined;
    body: BulkDeleteInput;
    response: BulkDeleteResult;
  };
}

export const EXAMS_ROUTE_KEYS: Record<keyof ExamsRoutes, true> = {
  'GET /exams/:id': true,
  'POST /exams': true,
  'PATCH /exams/:id': true,
  'DELETE /exams/:id': true,
  'POST /exams/bulk-delete': true,
};
