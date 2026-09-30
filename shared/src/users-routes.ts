// Записи карты маршрутов (api-routes.ts, ADR-0148) — люди школы: список,
// роли, блокировка, удаление, выгрузка данных, ссылка-приглашение и список
// ведущих. Роли и статус отдают изменённого `UserDto`, а не 204: экран «Люди»
// правит строку на месте без второго GET (ADR-0087). Удаление — честный 204:
// возвращать уже нечего, id у клиента есть. Выгрузка — целиком в ответе: файл
// собирает браузер админа, второго запроса за содержимым нет (ADR-0160).
import type { InviteLinkDto } from './invite-link';
import type { UserDataExportDto } from './user-export';
import type {
  ListUsersQuery,
  TeacherOptionDto,
  UpdateUserRolesInput,
  UpdateUserStatusInput,
  UserDto,
} from './users';

export interface UsersRoutes {
  'GET /users': { query: ListUsersQuery; body: undefined; response: UserDto[] };
  'GET /users/teachers': {
    query: undefined;
    body: undefined;
    response: TeacherOptionDto[];
  };
  'GET /users/invite-link': {
    query: undefined;
    body: undefined;
    response: InviteLinkDto;
  };
  'POST /users/invite-link': {
    query: undefined;
    body: undefined;
    response: InviteLinkDto;
  };
  'PATCH /users/:id': {
    query: undefined;
    body: UpdateUserRolesInput;
    response: UserDto;
  };
  'PATCH /users/:id/status': {
    query: undefined;
    body: UpdateUserStatusInput;
    response: UserDto;
  };
  'DELETE /users/:id': { query: undefined; body: undefined; response: void };
  'GET /users/:id/export': {
    query: undefined;
    body: undefined;
    response: UserDataExportDto;
  };
}

export const USERS_ROUTE_KEYS: Record<keyof UsersRoutes, true> = {
  'GET /users': true,
  'GET /users/teachers': true,
  'GET /users/invite-link': true,
  'POST /users/invite-link': true,
  'PATCH /users/:id': true,
  'PATCH /users/:id/status': true,
  'DELETE /users/:id': true,
  'GET /users/:id/export': true,
};
