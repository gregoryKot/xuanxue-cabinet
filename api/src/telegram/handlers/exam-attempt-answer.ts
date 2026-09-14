// Выбор варианта (single/multiple) и «Сдать» (ТЗ 4б.2, ADR-0024) — тот же
// приём, что exam-attempt-navigation.ts. Ответ уходит в
// ExamAttemptsService.saveAnswers СРАЗУ по нажатию — отдельного
// автосохранения не заводим, оно и так получается по одному ответу за раз.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { ExamBotPort } from '../exam-bot.port';
import { GENERIC_ERROR } from './callback-actions';
import { examUserFacingError } from './exam-attempt-error';
import type { OptionId } from './exam-callback-ids';
import {
  buildFinishedScreen,
  buildQuestionScreen,
  flattenAttemptQuestions,
} from './exam-question-screen';

async function render(
  ctx: Context,
  view: { text: string; buttons: ReturnType<typeof buildQuestionScreen>['buttons'] },
): Promise<void> {
  await ctx
    .editMessageText(view.text, { reply_markup: { inline_keyboard: view.buttons } })
    .catch(() => null);
}

/** `single` — выбор варианта отвечает на вопрос целиком, поэтому сразу
 * заменяет прошлый выбор; `multiple` — кнопка-переключатель, добавляет или
 * убирает вариант из уже выбранных. */
function nextOptionIds(
  current: string[],
  optionId: string,
  isMultiple: boolean,
): string[] {
  if (!isMultiple) return [optionId];
  return current.includes(optionId)
    ? current.filter((id) => id !== optionId)
    : [...current, optionId];
}

export async function handleExamOption(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  ids: OptionId,
  now: DateTime,
): Promise<void> {
  try {
    const attempt = await examBot.loadOwnAttempt(ids.attemptId, user, now);
    if (!attempt) {
      await ctx.editMessageText(ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
      return;
    }
    if (attempt.status !== 'in_progress') {
      await render(ctx, buildFinishedScreen(attempt, false));
      return;
    }

    const questions = flattenAttemptQuestions(attempt);
    const question = questions[ids.questionIndex];
    const option = question?.options[ids.optionIndex];
    if (
      !question ||
      !option ||
      (question.kind !== 'single' && question.kind !== 'multiple')
    ) {
      await ctx.editMessageText(GENERIC_ERROR).catch(() => null);
      return;
    }

    const current =
      attempt.answers.find((a) => a.itemId === question.itemId)?.optionIds ?? [];
    const optionIds = nextOptionIds(current, option.id, question.kind === 'multiple');
    const updated = await examBot.saveAnswer(
      ids.attemptId,
      user,
      { itemId: question.itemId, optionIds },
      now,
    );

    // `single` — выбор одного варианта завершает вопрос, экран сам
    // переходит к следующему; на последнем вопросе остаёмся на месте —
    // «Сдать» в навигации уже виден, отдельного авто-перехода в отправку нет
    // (ТЗ: «Сдать» — явное действие, не последствие ответа).
    const nextIndex =
      question.kind === 'single' && ids.questionIndex < questions.length - 1
        ? ids.questionIndex + 1
        : ids.questionIndex;
    await render(ctx, buildQuestionScreen(updated, nextIndex));
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}

export async function handleExamSubmit(
  ctx: Context,
  examBot: ExamBotPort,
  user: UserLean,
  attemptId: string,
  now: DateTime,
): Promise<void> {
  try {
    const attempt = await examBot.submitAttempt(attemptId, user, now);
    await render(ctx, buildFinishedScreen(attempt, true));
  } catch (err) {
    await ctx.editMessageText(examUserFacingError(err)).catch(() => null);
  }
}
