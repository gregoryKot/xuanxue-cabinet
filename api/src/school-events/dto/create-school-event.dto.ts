// Тело POST /events (ADR-0177). `createdBy` — из сессии (@CurrentUser), не из
// тела. Строгий ISO 8601 только проверяет форму; смещение и порядок дат
// проверяет сервис (parseUtcIso, assertEndsNotBeforeStart).
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SCHOOL_EVENT_LIMITS, type ApiRouteBody } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class CreateSchoolEventDto implements ApiRouteBody<'POST /events'> {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCHOOL_EVENT_LIMITS.title)
  title!: string;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCHOOL_EVENT_LIMITS.place)
  place?: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCHOOL_EVENT_LIMITS.description)
  description?: string;
}
