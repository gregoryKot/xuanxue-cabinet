// Уведомления вокруг экзамена (слой 4.7, docs/PLAN.md §11): учителю/
// помощнику — «работу сдали, ждёт проверки» (`attempt_submitted`), ученику —
// «работу проверили» (`exam_result`). Интерфейс отделяет
// ExamAttemptsService/exam-attempt-lifecycle.ts/ExamGradingsService (данные
// экзамена, шифрование, владение) от способа доставки — реализация
// (TelegramExamNotifier, api/src/telegram/) шлёт личным сообщением тем, у
// кого есть активный чат с ботом и включён этот вид уведомления; отправка —
// best-effort и не должна ронять HTTP-ответ (CLAUDE.md «Логи и наблюдаемость»,
// «Ошибки»): реализация ловит свои сбои сама (Logger.warn), а вызывающий
// сервис не ждёт результата — Telegraf вне api/src/telegram и api/src/channels
// запрещён eslint («Каналы»), поэтому порт живёт здесь, рядом с сервисами
// экзамена, а не в telegram/.
import type { DateTime } from 'luxon';
import type { GradingOutcome } from '@xuanxue/shared';

/** Кто сдал и что — учителю/помощнику (TelegramExamNotifier сам резолвит имя
 * ученика по `userId`, ExamNotifier об именах не знает). */
export interface AttemptSubmittedContext {
  attemptId: string;
  examId: string;
  examTitle: string;
  userId: string;
}

/** Итог проверки — ученику, чью работу проверили. */
export interface ExamGradedContext {
  attemptId: string;
  examId: string;
  examTitle: string;
  userId: string;
  outcome: GradingOutcome;
  comment?: string;
}

export interface ExamNotifier {
  /** Ровно один раз на попытку — вызывающий код гарантирует это местом
   * вызова (ровно там, где сам совершил переход в `submitted`), не
   * ExamNotifier: см. комментарий у `closeIfExpiredAttempt`
   * (exam-attempt-lifecycle.ts) и `ExamAttemptsService.submit`. */
  notifyAttemptSubmitted(context: AttemptSubmittedContext, now: DateTime): Promise<void>;

  /** На каждый вызов `ExamGradingsService.grade()`, включая переписанную
   * оценку — ученик должен узнать, что учитель поправил результат. */
  notifyExamGraded(context: ExamGradedContext, now: DateTime): Promise<void>;
}

export const EXAM_NOTIFIER = Symbol('EXAM_NOTIFIER');
