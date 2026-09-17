// «Начать»/«Продолжить» и переход «Назад»/«Дальше» между вопросами (ТЗ 4б.2,
// ADR-0024) — тот же приём, что callback-actions.ts: try/catch,
// editMessageText, владение и лимит попыток проверяет сам сервис
// (ExamAttemptsService через ExamBotPort), здесь только маршрутизация к
// экрану. `answerCbQuery()` — в CallbackQueryHandler.handle, до этого вызова
// (CLAUDE.md «Telegram»). Сам экран, картинки вариантов и ожидание ответа
// под него (text/video, ТЗ 4б.2 часть 2) — общая точка
// exam-question-render.ts, не дублируем здесь.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { examUserFacingError } from './exam-attempt-error';
import type { QuestionId } from './exam-callback-ids';
import { presentAttemptScreen, renderAttemptScreen } from './exam-question-render';

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
    await presentAttemptScreen(
      ctx,
      { examBot, user, chatId, attemptId: attempt.id },
      view,
      {
        via: 'edit',
        withAlbum: true,
      },
    );
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
    await presentAttemptScreen(
      ctx,
      { examBot, user, chatId, attemptId: ids.attemptId },
      view,
      { via: 'edit', withAlbum: true },
    );
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}
