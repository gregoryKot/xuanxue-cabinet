// Записи карты маршрутов (api-routes.ts, ADR-0148) — группы школы (ADR-0193).
// Список читают экран «Школа» и форма занятия; записи возвращают группу
// целиком (ADR-0087), удаление — 204.
import type { GroupDto, GroupInput } from './groups';

export interface GroupsRoutes {
  'GET /groups': { query: undefined; body: undefined; response: GroupDto[] };
  'POST /groups': { query: undefined; body: GroupInput; response: GroupDto };
  'PATCH /groups/:id': { query: undefined; body: GroupInput; response: GroupDto };
  'DELETE /groups/:id': { query: undefined; body: undefined; response: void };
}

export const GROUPS_ROUTE_KEYS: Record<keyof GroupsRoutes, true> = {
  'GET /groups': true,
  'POST /groups': true,
  'PATCH /groups/:id': true,
  'DELETE /groups/:id': true,
};
