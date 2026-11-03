// Тело PUT /me/student-mode (ADR-0163) и PUT /me/teacher-mode (ADR-0190) —
// одна ручка на оба направления: `true` включает режим (ученика — только у
// штата, учителя — только у админа; сервер проверяет роли в БД), `false`
// выключает (можно всегда). userId в теле нет и не будет: владелец — сессия
// (@CurrentUser()), иначе один человек мог бы переключить другому режим, просто
// прислав чужой id (SECURITY §2). Лишнее поле — 400 (`forbidNonWhitelisted`).
import { IsBoolean } from 'class-validator';
import type { ApiRouteBody } from '@xuanxue/shared';

export class SetStudentModeDto implements ApiRouteBody<'PUT /me/student-mode'> {
  @IsBoolean()
  enabled!: boolean;
}

export class SetTeacherModeDto implements ApiRouteBody<'PUT /me/teacher-mode'> {
  @IsBoolean()
  enabled!: boolean;
}
