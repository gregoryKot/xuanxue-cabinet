// Общий вызов ExamNotifier.notifyAttemptSubmitted (слой 4.7, PLAN §11) —
// делят ExamAttemptsService (submit() и колбэк closeIfExpiredAttempt в
// start()/list()/loadOwn()) и MyExamsService (тот же колбэк на своём вызове
// closeIfExpiredAttempt) — не по копии сборки контекста, try/catch и логгера
// в каждом сервисе (CLAUDE.md «Одна механика — один компонент», jscpd, а
// также «Файлы»: сервис дробится сюда, а не раздувается). Свой Logger — один
// на модуль, не на экземпляр сервиса (сервисам, которые лишь фонируют
// уведомление, не нужен собственный логгер ради одной этой строки).
// Fire-and-forget на HTTP-путях: не await'ится вызывающим кодом (CLAUDE.md
// «Встраивание в сервисы» — отправка не должна ждать в ответе HTTP), поэтому
// сама не бросает — сбой уходит в лог, а не наружу. Тик дедлайнов зовёт
// ожидающий вариант (`notifyAttemptSubmittedAndWait`), чтобы уведомления
// шли по одному, а не веером (аудит 2026-10-01 F11, ADR-0167).
import { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type { ExamNotifier } from './exam-notifier';
import type { LeanExamAttempt } from './exam-attempt.mapper';

const logger = new Logger('notifyAttemptSubmitted');

/** Ждёт отправку, но не бросает: сбой нотификатора — warn, тик идёт дальше. */
export async function notifyAttemptSubmittedAndWait(
  notifier: ExamNotifier,
  attempt: LeanExamAttempt,
  now: DateTime,
): Promise<void> {
  const context = {
    attemptId: attempt._id.toString(),
    examId: attempt.examId.toString(),
    examTitle: attempt.examTitle,
    userId: attempt.userId.toString(),
  };
  try {
    await notifier.notifyAttemptSubmitted(context, now);
  } catch (err) {
    logger.warn(`exam.notifyAttemptSubmitted: ${errorMessage(err)}`);
  }
}

export function notifyAttemptSubmitted(
  notifier: ExamNotifier,
  attempt: LeanExamAttempt,
  now: DateTime,
): void {
  void notifyAttemptSubmittedAndWait(notifier, attempt, now);
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

/** То же для closeExpiredAttempts (тик дедлайнов): колбэк возвращает Promise,
 * и lifecycle ждёт его перед следующей попыткой — в полёте одно уведомление. */
export function attemptSubmittedAwaitedCallback(
  notifier: ExamNotifier,
  now: DateTime,
): (closed: LeanExamAttempt) => Promise<void> {
  return (closed) => notifyAttemptSubmittedAndWait(notifier, closed, now);
}
