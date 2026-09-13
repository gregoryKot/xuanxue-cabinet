// Общий вызов ExamNotifier.notifyExamGraded (слой 4.7, PLAN §11) — вынесен
// из ExamGradingsService.grade() тем же приёмом, что notify-attempt-submitted.ts
// (CLAUDE.md «Файлы»: сервис дробится сюда, а не раздувается; «Встраивание в
// сервисы»: не роняем PUT из-за бота, не ждём его). Свой Logger — один на
// модуль, не на экземпляр сервиса.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { GradingOutcome } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import type { ExamNotifier } from './exam-notifier';
import type { LeanExamAttempt } from './exam-attempt.mapper';

const logger = new Logger('notifyExamGraded');

/** На каждый успешный вызов, включая переписанную оценку — учитель поправил
 * результат, ученик должен узнать заново (в отличие от attempt_submitted
 * здесь нет требования «ровно один раз за жизнь попытки»). */
export function notifyExamGraded(
  notifier: ExamNotifier,
  attempt: LeanExamAttempt,
  outcome: GradingOutcome,
  comment: string | undefined,
  now: DateTime,
): void {
  const context = {
    attemptId: attempt._id.toString(),
    examId: attempt.examId.toString(),
    examTitle: attempt.examTitle,
    userId: attempt.userId.toString(),
    outcome,
    comment,
  };
  notifier.notifyExamGraded(context, now).catch((err: unknown) => {
    logger.warn(`exam.notifyExamGraded: ${errorMessage(err)}`);
  });
}
