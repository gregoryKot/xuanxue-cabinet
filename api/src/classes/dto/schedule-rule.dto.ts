// Субдокумент правила расписания в теле POST/PATCH /classes — одна форма для
// создания и правки. `id` есть у существующего правила (сервис сохраняет его
// как `_id` субдокумента, см. classes.update.ts/mapRules), без `id` — новое.
import { IsIn, IsInt, IsMongoId, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  CLASS_LIMITS,
  RULE_TIME_RE,
  WEEKDAYS,
  type ScheduleRuleInput,
  type Weekday,
} from '@xuanxue/shared';

export class ScheduleRuleDto implements ScheduleRuleInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @IsIn(WEEKDAYS)
  weekday!: Weekday;

  @Matches(RULE_TIME_RE, { message: 'Время — в формате ЧЧ:ММ, например 19:00.' })
  time!: string;

  @IsInt()
  @Min(CLASS_LIMITS.durationMinMin)
  @Max(CLASS_LIMITS.durationMinMax)
  durationMin!: number;
}
