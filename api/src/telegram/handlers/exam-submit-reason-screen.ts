// «Сдать» в боте при пропущенном объяснении (ADR-0146). Сервис и так
// откажет (assertReasonsGiven), но отказ через examUserFacingError заменяет
// экран голым текстом без кнопок — ученику нечем вернуться к вопросу. Поэтому
// до отправки проверяем снимок тем же правилом (findMissingReasonNumbers из
// shared, одна механика на сервер и бота) и показываем первый вопрос без
// объяснения, с текстом отказа сверху.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { findMissingReasonNumbers, formatMissingReasonMessage } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { presentAttemptScreen, renderAttemptScreen } from './exam-question-render';

interface SubmitReasonDeps {
  examBot: ExamBotPort;
  botSessions: BotSessionService;
  user: UserLean;
  chatId: number;
  attemptId: string;
}

/** `true` — объяснения не хватило и экран вопроса уже показан, отправлять
 * не нужно; `false` — всё на месте (или попытка уже не в работе), дальше
 * обычная отправка. */
export async function presentMissingReason(
  ctx: Context,
  deps: SubmitReasonDeps,
  now: DateTime,
): Promise<boolean> {
  const { examBot, botSessions, user, chatId, attemptId } = deps;
  const attempt = await examBot.loadOwnAttempt(attemptId, user, now);
  if (attempt?.status !== 'in_progress') return false;
  const numbers = findMissingReasonNumbers(attempt.blocks, attempt.answers);
  const first = numbers[0];
  if (first === undefined) return false;
  const view = await renderAttemptScreen(botSessions, chatId, attempt, first - 1, now);
  await presentAttemptScreen(
    ctx,
    { examBot, user, chatId, attemptId },
    { ...view, text: `${formatMissingReasonMessage(numbers)}\n\n${view.text}` },
    { via: 'edit', withAlbum: true },
    now,
  );
  return true;
}
