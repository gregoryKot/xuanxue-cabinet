// «Начать»/«Продолжить» и переход «Назад»/«Дальше» между вопросами (ТЗ 4б.2,
// ADR-0024) — тот же приём, что callback-actions.ts: try/catch,
// editMessageText, владение и лимит попыток проверяет сам сервис
// (ExamAttemptsService через ExamBotPort), здесь только маршрутизация к
// экрану. `answerCbQuery()` — в CallbackQueryHandler.handle, до этого вызова
// (CLAUDE.md «Telegram»).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ATTEMPT_NOT_FOUND_MESSAGE, type ExamAttemptDto } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { ExamBotPort } from '../exam-bot.port';
import { examUserFacingError } from './exam-attempt-error';
import type { QuestionId } from './exam-callback-ids';
import { buildFinishedScreen, buildQuestionScreen } from './exam-question-screen';

async function renderScreen(
  ctx: Context,
  view: { text: string; buttons: ReturnType<typeof buildQuestionScreen>['buttons'] },
): Promise<void> {
  await ctx
    .editMessageText(view.text, { reply_markup: { inline_keyboard: view.buttons } })
    .catch(() => null);
}

function attemptScreen(attempt: ExamAttemptDto, index: number, justSubmitted = false) {
  return attempt.status === 'in_progress'
    ? buildQuestionScreen(attempt, index)
    : buildFinishedScreen(attempt, justSubmitted);
}

export async function handleExamStart(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  examId: string,
  now: DateTime,
): Promise<void> {
  try {
    const attempt = await examBot.startAttempt(examId, user, now);
    await renderScreen(ctx, attemptScreen(attempt, 0));
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}

export async function handleExamQuestion(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  ids: QuestionId,
  now: DateTime,
): Promise<void> {
  try {
    const attempt = await examBot.loadOwnAttempt(ids.attemptId, user, now);
    if (!attempt) {
      await ctx.editMessageText(ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
      return;
    }
    await renderScreen(ctx, attemptScreen(attempt, ids.index));
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}
