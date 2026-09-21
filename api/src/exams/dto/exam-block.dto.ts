// Блок формы в теле POST/PATCH /exams — одна форма для создания и правки:
// правка blocks всегда заменяет набор целиком (в отличие от правил
// расписания у занятий, у блока своего входного признака «удалить блок»
// нет, см. exam-blocks.ts/mapBlocks). `required` из контракта убран
// (ADR-0033): пайп с `forbidNonWhitelisted` (app.setup.ts) ответит вкладке со
// старым бандлом 400, а не сохранит форму мимо смысла — e2e фиксирует это.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EXAM_LIMITS, type ExamBlockInput } from '@xuanxue/shared';
import { OptionalNotNull } from '../../common/validation';

// Меньше одного вопроса сдающему не показать — местная константа, второго
// места использования нет (CLAUDE.md «Без магических чисел и строк»).
const MIN_QUESTIONS_PER_ATTEMPT = 1;

export class ExamBlockDto implements ExamBlockInput {
  @IsOptional()
  @IsMongoId()
  id?: string;

  @OptionalNotNull()
  @IsString()
  @MaxLength(EXAM_LIMITS.blockTitle)
  title?: string;

  @IsArray()
  @ArrayMaxSize(EXAM_LIMITS.itemsPerBlockMax)
  @IsMongoId({ each: true })
  itemIds!: string[];

  @OptionalNotNull()
  @IsBoolean()
  shuffle?: boolean;

  // Верхняя граница — та же, что у itemIds (ArrayMaxSize выше): больше
  // вопросов в попытке, чем может быть в блоке, всё равно бессмысленно;
  // точное «не больше длины списка» проверяет сервис (assertQuestionsPerAttemptFits,
  // exam-blocks.ts) — в DTO оно не выразить без похода в базу.
  @OptionalNotNull()
  @IsInt()
  @Min(MIN_QUESTIONS_PER_ATTEMPT)
  @Max(EXAM_LIMITS.itemsPerBlockMax)
  questionsPerAttempt?: number;

  // Точное «подмножество itemIds» и «не больше questionsPerAttempt» проверяет
  // сервис (mapBlocks отбрасывает лишнее, assertRequiredFitsPick считает
  // длину) — в DTO это не выразить декоратором.
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(EXAM_LIMITS.itemsPerBlockMax)
  @IsMongoId({ each: true })
  requiredItemIds?: string[];
}
