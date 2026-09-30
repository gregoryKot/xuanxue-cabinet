// Тело PUT /me/payments/reminder-day (ADR-0160): день месяца 1–31 или `null` —
// «как у школы». Владелец — сессия, userId в теле нет (SECURITY §3). `null`
// проходит мимо проверок числа явно: без `ValidateIf` `@IsInt()` отказал бы
// и ему, а отсутствие поля (undefined) по-прежнему получает 400.
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { SETTINGS_LIMITS, type SetPaymentReminderDayInput } from '@xuanxue/shared';

export class SetPaymentReminderDayDto implements SetPaymentReminderDayInput {
  @ValidateIf((_object: object, value: unknown) => value !== null)
  @IsInt()
  @Min(SETTINGS_LIMITS.paymentReminderDayMin)
  @Max(SETTINGS_LIMITS.paymentReminderDayMax)
  dayOfMonth!: number | null;
}
