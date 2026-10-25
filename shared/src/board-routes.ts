// Записи карты маршрутов (api-routes.ts, ADR-0148) — доска ученика. Пока одна
// строка: объявление учителя со сроком показа (ADR-0172). Экзамены и оплата
// на доске приходят из своих маршрутов (`GET /me/exams`, `GET /me/payments`).
import type { MyBoardDto } from './board';

export interface BoardRoutes {
  'GET /me/board': { query: undefined; body: undefined; response: MyBoardDto };
}

export const BOARD_ROUTE_KEYS: Record<keyof BoardRoutes, true> = {
  'GET /me/board': true,
};
