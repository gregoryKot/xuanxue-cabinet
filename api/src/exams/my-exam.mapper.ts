// Маппер ExamRecord (lean, уже расшифрованный) → MyExamDto (`/me/exams`, ТЗ
// docs/PLAN.md §11) — чистая функция без Mongo и DI. Положение ученика
// (сколько попыток использовано, что с последней) считает вызывающий код
// (MyExamsService): здесь только сборка ответа из готовых чисел.
import type { Types } from 'mongoose';
import type {
  ExamAttemptStatus,
  GradingCriterionDto,
  GradingOutcome,
  MyExamDto,
} from '@xuanxue/shared';

export interface MyExamInput {
  _id: Types.ObjectId;
  title: string;
  description: string;
  level: string;
  attemptsAllowed: number;
}

/** Оценка последней попытки, если она уже выставлена (слой 4.6) — баллы по
 * критериям рубрики можно показать ученику как есть (его собственная
 * работа), критерии проверки вопроса сюда не попадают: это другая сущность
 * (`ExamItemDto.criteria`), MyExamsService её не читает. */
export interface MyExamLastAttemptInput {
  id: string;
  status: ExamAttemptStatus;
  outcome?: GradingOutcome;
  comment?: string;
  criteria?: GradingCriterionDto[];
}

export function toMyExamDto(
  exam: MyExamInput,
  attemptsUsed: number,
  lastAttempt: MyExamLastAttemptInput | undefined,
): MyExamDto {
  return {
    id: exam._id.toString(),
    title: exam.title,
    // `.lean()` не переприменяет схемный default('') к документу, из
    // которого поле удалили через $unset (та же оговорка, что у toExamDto).
    description: exam.description ?? '',
    level: exam.level ?? '',
    attemptsAllowed: exam.attemptsAllowed,
    attemptsUsed,
    lastAttempt,
  };
}
