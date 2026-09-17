// Тело PATCH /attempts/:id/answers.
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import type { SaveAttemptAnswersInput } from '@xuanxue/shared';
import { AttemptAnswerInputDto } from './attempt-answer.dto';

// Не в ATTEMPT_LIMITS (shared/src/exams.ts, контракт ТЗ 4.4 буквально) —
// предел на число ответов в одном запросе, а не смысловая величина продукта
// (сам экзамен ограничен EXAM_LIMITS.blocksMax * itemsPerBlockMax).
const ANSWERS_PER_REQUEST_MAX = 200;

export class SaveAttemptAnswersDto implements SaveAttemptAnswersInput {
  @IsArray()
  @ArrayMaxSize(ANSWERS_PER_REQUEST_MAX)
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerInputDto)
  answers!: AttemptAnswerInputDto[];
}
