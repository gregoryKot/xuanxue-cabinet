// Тело PUT /me/notifications/lessons/reminder-minutes (ADR-0162): одно из
// `LESSON_REMINDER_CHOICES` или `null` — «как в школе». Владелец — сессия,
// userId в теле нет (SECURITY §3). `null` обходит проверку списка явно: без
// `ValidateIf` `@IsIn` отказал бы и ему, а отсутствие поля (undefined) по-
// прежнему получает 400 — тот же приём, что у SetPaymentReminderDayDto.
import { IsIn, ValidateIf } from 'class-validator';
import { LESSON_REMINDER_CHOICES, type ApiRouteBody } from '@xuanxue/shared';

export class UpdateLessonReminderDto implements ApiRouteBody<'PUT /me/notifications/lessons/reminder-minutes'> {
  @ValidateIf((_object: object, value: unknown) => value !== null)
  @IsIn(LESSON_REMINDER_CHOICES)
  minutes!: number | null;
}
