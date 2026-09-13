// Общий вызов ExamNotifier.notifyAttemptSubmitted (слой 4.7, PLAN §11) —
// делят ExamAttemptsService (submit() и колбэк closeIfExpiredAttempt в
// start()/list()/loadOwn()) и MyExamsService (тот же колбэк на своём вызове
// closeIfExpiredAttempt) — не по копии сборки контекста, try/catch и логгера
// в каждом сервисе (CLAUDE.md «Одна механика — один компонент», jscpd, а
// также «Файлы»: сервис дробится сюда, а не раздувается). Свой Logger — один
// на модуль, не на экземпляр сервиса (сервисам, которые лишь фонируют
// уведомление, не нужен собственный логгер ради одной этой строки).
// Fire-and-forget: не await'ится вызывающим кодом (CLAUDE.md «Встраивание в
// сервисы» — отправка не должна ждать в ответе HTTP), поэтому сама не
// бросает — `.catch()` уходит в лог, а не наружу.
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type { ExamNotifier } from './exam-notifier';
import type { LeanExamAttempt } from './exam-attempt.mapper';

const logger = new Logger('notifyAttemptSubmitted');

export function notifyAttemptSubmitted(
  notifier: ExamNotifier,
  attempt: LeanExamAttempt,
  now: DateTime,
): void {
  const context = {
    attemptId: attempt._id.toString(),
    examId: attempt.examId.toString(),
    examTitle: attempt.examTitle,
    userId: attempt.userId.toString(),
  };
  notifier.notifyAttemptSubmitted(context, now).catch((err: unknown) => {
    logger.warn(`exam.notifyAttemptSubmitted: ${errorMessage(err)}`);
  });
}

/** Колбэк для closeIfExpiredAttempt (exam-attempt-lifecycle.ts) — вызывается
 * ровно там, где lifecycle сам выиграл гонку перехода в `submitted` (см. её
 * комментарий-шапку), поэтому ровно один раз на попытку, даже когда
 * start()/list()/loadOwn()/MyExamsService.list() идут параллельно на одном
 * и том же документе. */
export function attemptSubmittedCallback(
  notifier: ExamNotifier,
  now: DateTime,
): (closed: LeanExamAttempt) => void {
  return (closed) => notifyAttemptSubmitted(notifier, closed, now);
}
