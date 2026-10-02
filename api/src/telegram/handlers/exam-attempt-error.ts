// Текст ошибки пользователю для действий экзамена в боте — отдельно от
// callback-actions.ts::userFacingError: там NotFoundError|ConflictError
// (рассылки, доставки), здесь NotFoundError|InvalidInputError — все тексты
// экзамена уже написаны по VOICE в самом сервисе (EXAM_NOT_PUBLISHED_MESSAGE,
// ATTEMPT_EXPIRED_MESSAGE, attemptsExceededMessage и т.д., shared/src/exam-attempts.ts,
// api/src/exams/attempts-exceeded-message.ts) — их и показываем как есть.
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { InvalidInputError, NotFoundError } from '../../common/errors';
import { GENERIC_ERROR } from './callback-actions';

const logger = new Logger('examAttemptBot');

function isKnownRefusal(err: unknown): boolean {
  return err instanceof NotFoundError || err instanceof InvalidInputError;
}

export function examUserFacingError(err: unknown): string {
  return isKnownRefusal(err) ? (err as Error).message : GENERIC_ERROR;
}

/** Один catch на все действия экзамена в боте: текст человеку и строка в
 * лог. До аудита 2026-10-01 (F35) пять catch глотали ошибку без следа —
 * шторм отказов у класса в боте владелец не увидел бы нигде. Понятный
 * отказ (нет попытки, время вышло) — warn, остальное — error со стеком.
 * `action` — что делал ученик (ответ, переход), без текста ответа (§4). */
export async function reportExamActionError(
  ctx: Context,
  err: unknown,
  action: string,
): Promise<void> {
  if (isKnownRefusal(err)) {
    logger.warn(`telegram.exam.${action}: отказ — ${errorMessage(err)}`);
  } else {
    logger.error(`telegram.exam.${action}: сбой — ${errorMessage(err)}`, errorStack(err));
  }
  await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
}
