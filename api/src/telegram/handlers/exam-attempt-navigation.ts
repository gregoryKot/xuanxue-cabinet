// «Начать»/«Продолжить» и переход «Назад»/«Дальше» между вопросами (ТЗ 4б.2,
// ADR-0024) — тот же приём, что callback-actions.ts: try/catch,
// editMessageText, владение и лимит попыток проверяет сам сервис
// (ExamAttemptsService через ExamBotPort), здесь только маршрутизация к
// экрану. `answerCbQuery()` — в CallbackQueryHandler.handle, до этого вызова
// (CLAUDE.md «Telegram»). Сам экран и ожидание ответа под него (text/video,
// ТЗ 4б.2 часть 2) — общая точка exam-question-render.ts, не дублируем
// здесь.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { examUserFacingError } from './exam-attempt-error';
import type { QuestionId } from './exam-callback-ids';
import { renderAttemptScreen } from './exam-question-render';
import type { BotMenu } from './bot-menu';

async function renderScreen(ctx: Context, view: BotMenu): Promise<void> {
  await ctx
    .editMessageText(view.text, { reply_markup: { inline_keyboard: view.buttons } })
    .catch(() => null);
}

export async function handleExamStart(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  user: UserLean,
  chatId: number,
  examId: string,
  now: DateTime,
): Promise<void> {
  try {
    const attempt = await examBot.startAttempt(examId, user, now);
    const view = await renderAttemptScreen(botSessions, chatId, attempt, 0, now);
    await renderScreen(ctx, view);
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}

export async function handleExamQuestion(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  user: UserLean,
  chatId: number,
  ids: QuestionId,
  now: DateTime,
): Promise<void> {
  try {
    const attempt = await examBot.loadOwnAttempt(ids.attemptId, user, now);
    if (!attempt) {
      await ctx.editMessageText(ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
      return;
    }
    const view = await renderAttemptScreen(botSessions, chatId, attempt, ids.index, now);
    await renderScreen(ctx, view);
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}
