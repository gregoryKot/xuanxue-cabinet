// Субдокумент правила расписания в теле POST/PATCH /classes — одна форма для
// создания и правки. `id` есть у существующего правила (сервис сохраняет его
// как `_id` субдокумента, см. classes.update.ts/mapRules), без `id` — новое.
import { IsIn, IsInt, IsMongoId, IsOptional, Matches, Max, Min } from 'class-validator';
import {
  CLASS_LIMITS,
  RULE_DATE_RE,
  RULE_EVERY_WEEKS,
  RULE_TIME_RE,
  WEEKDAYS,
  type RuleEveryWeeks,
  type ScheduleRuleInput,
  type Weekday,
} from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';

export class ScheduleRuleDto implements ScheduleRuleInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @IsIn(WEEKDAYS)
  weekday!: Weekday;

  // Продолжение фразы «Правило N, Время: …» (validation-messages.ts) — без
  // повтора имени поля, дефолтное сообщение «must match RULE_TIME_RE
  // regular expression» ничего не сказало бы про формат ЧЧ:ММ.
  @Matches(RULE_TIME_RE, { message: 'в формате ЧЧ:ММ, например 19:00.' })
  time!: string;

  @IsInt()
  @Min(CLASS_LIMITS.durationMinMin)
  @Max(CLASS_LIMITS.durationMinMax)
  durationMin!: number;

  // «Раз в две недели» (ADR-0168). Здесь — только форма значений; что при
  // `2` дата обязана быть и выпадать на день правила, проверяет
  // `mapRules` (classes.update.ts) доменной ошибкой с понятным текстом.
  @OptionalNotNull()
  @IsIn(RULE_EVERY_WEEKS)
  everyWeeks?: RuleEveryWeeks;

  @OptionalNotNull()
  @Matches(RULE_DATE_RE, { message: 'в формате ГГГГ-ММ-ДД, например 2026-10-02.' })
  startsOn?: string;
}
