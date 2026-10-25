// Тело PATCH /events/:id (ADR-0177). `title` и `startsAt` — не nullable:
// `OptionalNotNull()` пропускает только `undefined`, `null` получает 400.
// `endsAt`/`place`/`description` — единственные, где `null` значит «сбросить»
// (сервис превращает его в `$unset`); `@IsOptional()` пропускает и
// `undefined`, и `null`. Пустая строка вместо `null` не сбрасывает поле.
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SCHOOL_EVENT_LIMITS, type ApiRouteBody } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateSchoolEventDto implements ApiRouteBody<'PATCH /events/:id'> {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCHOOL_EVENT_LIMITS.title)
  title?: string;

  @OptionalNotNull()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string | null;

  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCHOOL_EVENT_LIMITS.place)
  place?: string | null;

  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCHOOL_EVENT_LIMITS.description)
  description?: string | null;
}
