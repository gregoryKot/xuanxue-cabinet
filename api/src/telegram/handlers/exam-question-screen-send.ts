// Экран вопроса новым сообщением — с честным сбоем (аудит 2026-10-01, F25):
// упавший reply раньше глушился `.catch(() => null)`, и ученик, у которого
// старый экран уже удалили, оставался без единой кнопки и без строки в логе.
// Вынесено из exam-question-render.ts файл-лимитом CLAUDE.md «Храповики».
import { Logger } from '@nestjs/common';
import type { Context } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import { errorMessage } from '../../common/error-info';
import { sendExamErrorText } from './exam-attempt-error';

const logger = new Logger('examAttemptScreen');

// Не молчим: короткий текст с кнопкой «В меню»; старый экран с кнопками при
// этом остаётся выше (presentAttemptScreen удаляет его только после успеха).
export const SCREEN_NOT_SENT_MESSAGE =
  'Экран не отправился. Нажмите «Дальше» ещё раз или /exams.';

/** `true` — экран ушёл; `false` — нет, в логе error, ученику — текст с кнопкой
 * «В меню». SECURITY §1: attemptId — полем объекта, не в строке. */
export async function replyScreenOrFallback(
  ctx: Context,
  attemptId: string,
  text: string,
  extra: { reply_markup: { inline_keyboard: InlineKeyboardButton[][] } },
): Promise<boolean> {
  try {
    await ctx.reply(text, extra);
    return true;
  } catch (err) {
    logger.error(`telegram.examScreen: экран не отправлен — ${errorMessage(err)}`, {
      attemptId,
    });
    await sendExamErrorText(ctx, SCREEN_NOT_SENT_MESSAGE, 'reply');
    return false;
  }
}
