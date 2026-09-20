// Тело POST /lessons — разовая дата занятия вне расписания. `plannedAt`/
// `ruleId` тут нет: их ставит только планировщик (identity слота из правила),
// у разового занятия их нет вовсе (docs/PLAN.md §6 «Планировщик»).
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CLASS_LIMITS,
  LESSON_LIMITS,
  TAG_LIMITS,
  type CreateLessonInput,
} from '@xuanxue/shared';
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

  // Рубрикация свободным текстом (ADR-0071) — нормализация (обрезка, дедуп
  // без учёта регистра) при записи, LessonsService/lessons.create.ts.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAG_LIMITS.perRecord)
  @IsString({ each: true })
  @MaxLength(TAG_LIMITS.length, { each: true })
  tags?: string[];
}
