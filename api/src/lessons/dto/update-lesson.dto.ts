// Тело PATCH /lessons/:id. topic/startsAt/durationMin/status — не nullable,
// `OptionalNotNull()` пропускает только `undefined`, `null` доходит до
// декораторов ниже и получает 400 (как в update-class.dto.ts).
// leaderId/zoomLinkOverride/zoomPasswordOverride/note — единственные поля,
// где `null` значит «сбросить»: `splitUpdate` (common/patch-update.ts)
// превращает его в `$unset` для NULLABLE_LESSON_FIELDS (shared/src/lessons.ts).
// `@IsOptional()` здесь пропускает и `undefined`, и `null` — декораторы
// после него на `null` уже не запускаются.
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CLASS_LIMITS,
  LESSON_LIMITS,
  LESSON_STATUSES,
  type LessonStatus,
  type UpdateLessonInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateLessonDto implements UpdateLessonInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @MaxLength(LESSON_LIMITS.topic)
  topic?: string;

  @OptionalNotNull()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @OptionalNotNull()
  @IsInt()
  @Min(CLASS_LIMITS.durationMinMin)
  @Max(CLASS_LIMITS.durationMinMax)
  durationMin?: number;

  @OptionalNotNull()
  @IsIn(LESSON_STATUSES)
  status?: LessonStatus;

  @IsOptional()
  @IsMongoId()
  leaderId?: string | null;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(CLASS_LIMITS.zoomLink)
  zoomLinkOverride?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(CLASS_LIMITS.zoomPassword)
  zoomPasswordOverride?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LESSON_LIMITS.note)
  note?: string | null;
}
