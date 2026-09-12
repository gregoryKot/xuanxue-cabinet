// Маппер ExamRecord (lean, уже расшифрованный) → MyExamDto (`/me/exams`, ТЗ
// student-api.md) — чистая функция без Mongo и DI. Положение ученика
// (сколько попыток использовано, что с последней) считает вызывающий код
// (MyExamsService): здесь только сборка ответа из готовых чисел.
import type { Types } from 'mongoose';
import type { ExamAttemptStatus, MyExamDto } from '@xuanxue/shared';

export interface MyExamInput {
  _id: Types.ObjectId;
  title: string;
  description: string;
  level: string;
  attemptsAllowed: number;
}

export interface MyExamLastAttemptInput {
  id: string;
  status: ExamAttemptStatus;
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
