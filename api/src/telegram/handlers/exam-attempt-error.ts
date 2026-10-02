// Текст ошибки пользователю для действий экзамена в боте — отдельно от
// callback-actions.ts::userFacingError: там NotFoundError|ConflictError
// (рассылки, доставки), здесь NotFoundError|InvalidInputError|ConflictError —
// все тексты экзамена уже написаны по VOICE в самом сервисе
// (EXAM_NOT_PUBLISHED_MESSAGE, ATTEMPT_EXPIRED_MESSAGE, attemptsExceededMessage,
// ATTEMPT_SAVE_CONFLICT_MESSAGE и т.д., shared/src/exam-attempts.ts,
// api/src/exams/attempts-exceeded-message.ts) — их и показываем как есть.
//
// Аудит 2026-10-01 (F51): ConflictError (потолок CAS) превращался в «Откройте
// /menu» вместо «отправьте ещё раз»; «Обновите страницу» уходило в Telegram,
// где страниц нет; ошибка заменяла экран с кнопками голым текстом — тупик.
// Теперь любой отказ уходит с кнопкой «В меню» (presentExamError).
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import {
  ATTEMPT_NOT_FOUND_BOT_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
} from '@xuanxue/shared';
import { errorMessage, errorStack } from '../../common/error-info';
import { ConflictError, InvalidInputError, NotFoundError } from '../../common/errors';
import { backToMenuButton } from './bot-menu';
import { GENERIC_ERROR } from './callback-actions';

const logger = new Logger('examAttemptBot');

/** Как показать текст: `edit` — на месте экрана по кнопке (callback), `reply`
 * — новым сообщением, когда редактировать нечего (ответ текстом). */
type ExamErrorVia = 'edit' | 'reply';

function isKnownRefusal(err: unknown): boolean {
  return (
    err instanceof NotFoundError ||
    err instanceof InvalidInputError ||
    err instanceof ConflictError
  );
}

export function examUserFacingError(err: unknown): string {
  if (!isKnownRefusal(err)) return GENERIC_ERROR;
  const message = (err as Error).message;
  return message === ATTEMPT_NOT_FOUND_MESSAGE ? ATTEMPT_NOT_FOUND_BOT_MESSAGE : message;
}

/** Текст отказа с кнопкой «В меню» — ученик не остаётся перед голым текстом
 * без выхода (F51). Сбой самой отправки глушится: это уже ответ на ошибку. */
export async function sendExamErrorText(
  ctx: Context,
  text: string,
  via: ExamErrorVia,
): Promise<void> {
  const extra = { reply_markup: { inline_keyboard: [backToMenuButton()] } };
  const send = via === 'edit' ? ctx.editMessageText(text, extra) : ctx.reply(text, extra);
  await send.catch(() => null);
}

export function presentExamError(
  ctx: Context,
  err: unknown,
  via: ExamErrorVia,
): Promise<void> {
  return sendExamErrorText(ctx, examUserFacingError(err), via);
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
  via: ExamErrorVia = 'edit',
): Promise<void> {
  if (isKnownRefusal(err)) {
    logger.warn(`telegram.exam.${action}: отказ — ${errorMessage(err)}`);
  } else {
    logger.error(`telegram.exam.${action}: сбой — ${errorMessage(err)}`, errorStack(err));
  }
  await presentExamError(ctx, err, via);
}
