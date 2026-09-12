// Один ответ в теле PATCH /attempts/:id/answers — заменяет ответ на этот
// `itemId` в попытке, остальные ответы не трогает (mergeAnswers,
// exam-attempt-answers.ts). Класс называется иначе, чем контракт
// `AttemptAnswerDto` из shared (там имя уже занято — тип используется и как
// вход, и как часть ответа API), поэтому импорт под псевдонимом.
import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ATTEMPT_LIMITS,
  type AttemptAnswerDto as AttemptAnswerContract,
} from '@xuanxue/shared';

export class AttemptAnswerInputDto implements AttemptAnswerContract {
  @IsMongoId()
  itemId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ATTEMPT_LIMITS.answerText)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ATTEMPT_LIMITS.optionsPerAnswer)
  @IsMongoId({ each: true })
  optionIds?: string[];
}
