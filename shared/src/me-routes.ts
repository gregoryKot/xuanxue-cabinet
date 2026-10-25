// Записи карты маршрутов (api-routes.ts, ADR-0148) — профиль человека про
// самого себя: `/me/*` скоупится по сессии, `id` в пути и теле не бывает
// (SECURITY §2). Маршруты отдают `MeDto`, а не 204: экраны «Профиль» и
// `/welcome` кладут ответ на себя без второго `GET /auth/me` — так #345
// чинил их, и ADR-0087 закрепил (`PUT /me/no-telegram`, `PATCH /me/profile`);
// `PUT /me/student-mode` (ADR-0163) — тем же приёмом: кабинет перестраивается
// по ответу; `PUT /me/home-tiles` (ADR-0179) — так же: главная перерисовывается по
// ответу.
import type { SetHomeTilesInput } from './home-tiles';
import type { MeDto, SetNoTelegramInput, SetStudentModeInput } from './me';
import type { UpdateMyProfileInput } from './person-name';

export interface MeRoutes {
  'PUT /me/no-telegram': { query: undefined; body: SetNoTelegramInput; response: MeDto };
  'PATCH /me/profile': { query: undefined; body: UpdateMyProfileInput; response: MeDto };
  'PUT /me/student-mode': {
    query: undefined;
    body: SetStudentModeInput;
    response: MeDto;
  };
  'PUT /me/home-tiles': { query: undefined; body: SetHomeTilesInput; response: MeDto };
}

export const ME_ROUTE_KEYS: Record<keyof MeRoutes, true> = {
  'PUT /me/no-telegram': true,
  'PATCH /me/profile': true,
  'PUT /me/student-mode': true,
  'PUT /me/home-tiles': true,
};
