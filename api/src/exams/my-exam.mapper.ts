// Маппер ExamRecord (lean, уже расшифрованный) → MyExamDto (`/me/exams`, ТЗ
// docs/PLAN.md §11) — чистая функция без Mongo и DI. Положение ученика
// (сколько попыток использовано, что с последней) считает вызывающий код
// (MyExamsService): здесь только сборка ответа из готовых чисел.
import type { Types } from 'mongoose';
import type { ExamAttemptStatus, GradingOutcome, MyExamDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LeanExamAttempt } from './exam-attempt.mapper';
import type { RawLeanExamGrading } from './exam-grading.mapper';

export interface MyExamInput {
  _id: Types.ObjectId;
  title: string;
  description: string;
  level: string;
  attemptsAllowed: number;
  // Нет поля — у формы не было лимита времени (ADR-0122, describeExamTime).
  timeLimitMin?: number;
}

/** Оценка последней попытки, если она уже выставлена (слой 4.6) — итог и
 * комментарий учителя можно показать ученику как есть (его собственная
 * работа). */
export interface MyExamLastAttemptInput {
  id: string;
  status: ExamAttemptStatus;
  // Закрыло ли последнюю попытку время, а не сам ученик — по этому полю
  // кабинет и бот решают, предложить ли «Пройти ещё раз» (getMyExamAction,
  // shared, ADR-0091). Значение приносит вызывающий сервис уже нормализованным.
  expired: boolean;
  outcome?: GradingOutcome;
  comment?: string;
  // Когда попытку закроет время — нет поля, если у попытки не было дедлайна
  // (форма без лимита или лимит появился уже после старта, ADR-0122).
  deadlineAt?: string;
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
    // Прямое присваивание, как у lastAttempt выше: undefined-ключ Mongoose/
    // JSON.stringify не отдаёт — второго приёма ради одного поля не заводим.
    timeLimitMin: exam.timeLimitMin,
    lastAttempt,
  };
}

/** Положение по последней попытке из её документа и оценки, если она уже
 * есть. Здесь, а не в MyExamsService: сервис остаётся диспетчером запросов,
 * сборка ответа живёт в маппере (CLAUDE.md «Храповики», лимит размера). */
export function toMyExamLastAttemptInput(
  attempt: LeanExamAttempt,
  grading: RawLeanExamGrading | undefined,
): MyExamLastAttemptInput {
  return {
    id: attempt._id.toString(),
    status: attempt.status,
    // Сравнение, не просто поле: `.lean()` не переприменяет схемный
    // default(false) к документу без поля вовсе (та же оговорка, что у
    // description/level в toMyExamDto) — у попыток старше этого поля
    // expired отсутствует в самом документе, а не false.
    expired: attempt.expired === true,
    outcome: grading?.outcome,
    comment: grading?.comment,
    // Только у идущей попытки: закрытой время уже ничего не отсчитывает, а
    // `deadlineAt` в записи остаётся старым и читался бы как живой дедлайн
    // (describeExamTime смотрит на то же условие статуса, exam-time.ts).
    deadlineAt:
      attempt.status === 'in_progress' && attempt.deadlineAt
        ? toIsoUtc(attempt.deadlineAt)
        : undefined,
  };
}
