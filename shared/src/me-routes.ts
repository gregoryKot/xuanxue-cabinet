// Записи карты маршрутов (api-routes.ts, ADR-0148) — профиль человека про
// самого себя: `/me/*` скоупится по сессии, `id` в пути и теле не бывает
// (SECURITY §2). Оба маршрута отдают `MeDto`, а не 204: экраны «Профиль» и
// `/welcome` кладут ответ на себя без второго `GET /auth/me` — так #345
// чинил их, и ADR-0087 закрепил (`PUT /me/no-telegram`, `PATCH /me/profile`).
import type { MeDto, SetNoTelegramInput } from './me';
import type { UpdateMyProfileInput } from './person-name';

export interface MeRoutes {
  'PUT /me/no-telegram': { query: undefined; body: SetNoTelegramInput; response: MeDto };
  'PATCH /me/profile': { query: undefined; body: UpdateMyProfileInput; response: MeDto };
}

export const ME_ROUTE_KEYS: Record<keyof MeRoutes, true> = {
  'PUT /me/no-telegram': true,
  'PATCH /me/profile': true,
};
