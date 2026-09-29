// Записи карты маршрутов (api-routes.ts, ADR-0148) — задания глазами ученика
// (MyExamsController): опубликованные формы и его положение по ним (PLAN §11).
// Отметка «открыл карточку» (ADR-0129) отдаёт список целиком, не 204, как
// действия ленты (ADR-0087); кабинет ответ на экран не кладёт — гонка со
// стартом попытки, см. MyExamsProvider.tsx.
import type { ListMyExamsQuery, MyExamDto } from './my-exams';

export interface MyExamsRoutes {
  'GET /me/exams': { query: ListMyExamsQuery; body: undefined; response: MyExamDto[] };
  'POST /me/exams/:examId/seen': {
    query: undefined;
    body: undefined;
    response: MyExamDto[];
  };
}

export const MY_EXAMS_ROUTE_KEYS: Record<keyof MyExamsRoutes, true> = {
  'GET /me/exams': true,
  'POST /me/exams/:examId/seen': true,
};
