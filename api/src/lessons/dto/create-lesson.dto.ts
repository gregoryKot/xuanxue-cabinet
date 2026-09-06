// Тело POST /lessons — разовая дата занятия вне расписания. `plannedAt`/
// `ruleId` тут нет: их ставит только планировщик (identity слота из правила),
// у разового занятия их нет вовсе (docs/PLAN.md §6 «Планировщик»).
import {
  IsInt,
  IsISO8601,
  IsMongoId,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CLASS_LIMITS, LESSON_LIMITS, type CreateLessonInput } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class CreateLessonDto implements CreateLessonInput {
  @IsMongoId()
  classId!: string;

  @IsISO8601({ strict: true })
  startsAt!: string;

  @OptionalNotNull()
  @IsInt()
  @Min(CLASS_LIMITS.durationMinMin)
  @Max(CLASS_LIMITS.durationMinMax)
  durationMin?: number;

  @OptionalNotNull()
  @TrimString()
  @IsString()
  @MaxLength(LESSON_LIMITS.topic)
  topic?: string;
}
