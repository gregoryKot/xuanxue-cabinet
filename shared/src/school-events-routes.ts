// Записи карты маршрутов (api-routes.ts, ADR-0148) — события школы (ADR-0177):
// CRUD штата и список предстоящих для любого вошедшего.
import type {
  CreateSchoolEventInput,
  ListSchoolEventsQuery,
  SchoolEventDto,
  UpdateSchoolEventInput,
} from './school-events';

export interface SchoolEventsRoutes {
  'GET /events': {
    query: ListSchoolEventsQuery;
    body: undefined;
    response: SchoolEventDto[];
  };
  'POST /events': {
    query: undefined;
    body: CreateSchoolEventInput;
    response: SchoolEventDto;
  };
  'PATCH /events/:id': {
    query: undefined;
    body: UpdateSchoolEventInput;
    response: SchoolEventDto;
  };
  'DELETE /events/:id': { query: undefined; body: undefined; response: void };
  'GET /me/events': { query: undefined; body: undefined; response: SchoolEventDto[] };
}

export const SCHOOL_EVENTS_ROUTE_KEYS: Record<keyof SchoolEventsRoutes, true> = {
  'GET /events': true,
  'POST /events': true,
  'PATCH /events/:id': true,
  'DELETE /events/:id': true,
  'GET /me/events': true,
};
