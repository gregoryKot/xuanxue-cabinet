// Записи карты маршрутов (api-routes.ts, ADR-0148) — занятия расписания
// (ADR-0033). Записи редактора — общий useEntityEditor.
import type { ClassDto, CreateClassInput, UpdateClassInput } from './classes';

export interface ClassesRoutes {
  'GET /classes/:id': { query: undefined; body: undefined; response: ClassDto };
  'POST /classes': { query: undefined; body: CreateClassInput; response: ClassDto };
  'PATCH /classes/:id': { query: undefined; body: UpdateClassInput; response: ClassDto };
  'DELETE /classes/:id': { query: undefined; body: undefined; response: void };
}

export const CLASSES_ROUTE_KEYS: Record<keyof ClassesRoutes, true> = {
  'GET /classes/:id': true,
  'POST /classes': true,
  'PATCH /classes/:id': true,
  'DELETE /classes/:id': true,
};
