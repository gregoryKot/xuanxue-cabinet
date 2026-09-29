// Записи карты маршрутов (api-routes.ts, ADR-0148) — занятия глазами ученика
// (MyLessonsController): ближайшие и архив прошедших (PLAN §11, §14 слой 3.3).
// Только чтение: ученик смотрит расписание школы, своих данных здесь нет.
import type { ListMyLessonsQuery, MyLessonDto } from './lessons';
import type {
  ListMyArchivedLessonsQuery,
  MyArchivedLessonDto,
} from './my-lessons-archive';

export interface MyLessonsRoutes {
  'GET /me/lessons': {
    query: ListMyLessonsQuery;
    body: undefined;
    response: MyLessonDto[];
  };
  'GET /me/lessons/archive': {
    query: ListMyArchivedLessonsQuery;
    body: undefined;
    response: MyArchivedLessonDto[];
  };
}

export const MY_LESSONS_ROUTE_KEYS: Record<keyof MyLessonsRoutes, true> = {
  'GET /me/lessons': true,
  'GET /me/lessons/archive': true,
};
