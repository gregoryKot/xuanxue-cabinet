// Тело PUT /me/student-mode — одна ручка на оба направления (ADR-0163):
// `true` включает режим ученика (только у штата, сервер проверяет роли в БД),
// `false` выключает (можно всегда). userId в теле нет и не будет: владелец —
// сессия (@CurrentUser()), иначе один человек мог бы переключить другому режим,
// просто прислав чужой id (SECURITY §2). Лишнее поле — 400 (`forbidNonWhitelisted`).
import { IsBoolean } from 'class-validator';
import type { ApiRouteBody } from '@xuanxue/shared';

export class SetStudentModeDto implements ApiRouteBody<'PUT /me/student-mode'> {
  @IsBoolean()
  enabled!: boolean;
}
