// Записи карты маршрутов (api-routes.ts, ADR-0148) — публичное расписание для
// daychi (PublicLessonsController, ADR-0170). Единственный маршрут с данными
// школы без сессии; только чтение.
import type { ListPublicLessonsQuery, PublicLessonDto } from './public-lessons';

export interface PublicLessonsRoutes {
  'GET /public/lessons': {
    query: ListPublicLessonsQuery;
    body: undefined;
    response: PublicLessonDto[];
  };
}

export const PUBLIC_LESSONS_ROUTE_KEYS: Record<keyof PublicLessonsRoutes, true> = {
  'GET /public/lessons': true,
};
