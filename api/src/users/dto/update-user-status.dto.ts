// Тело PATCH /users/:id/status — блокировка/открытие доступа на «Людях»
// (см. shared/src/users.ts). USER_STATUSES — 'active' | 'blocked', статуса
// «ждёт подтверждения» больше нет (ADR-0036).
import { IsIn } from 'class-validator';
import { USER_STATUSES, type ApiRouteBody, type UserStatus } from '@xuanxue/shared';

export class UpdateUserStatusDto implements ApiRouteBody<'PATCH /users/:id/status'> {
  @IsIn(USER_STATUSES)
  status!: UserStatus;
}
