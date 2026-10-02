// Выбор варианта (single/multiple) и «Сдать» (ТЗ 4б.2, ADR-0024) — тот же
// приём, что exam-attempt-navigation.ts. Ответ уходит в
// ExamAttemptsService.saveAnswers СРАЗУ по нажатию — отдельного
// автосохранения не заводим, оно и так получается по одному ответу за раз.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { GENERIC_ERROR } from './callback-actions';
import { reportExamActionError } from './exam-attempt-error';
import type { OptionId } from './exam-callback-ids';
import { buildFinishedScreen, flattenAttemptQuestions } from './exam-question-screen';
import { presentAttemptScreen, renderAttemptScreen } from './exam-question-render';
import { presentMissingReason } from './exam-submit-reason-screen';

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
  botSessions: BotSessionService,
  user: UserLean,
  chatId: number,
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
      await presentAttemptScreen(
        ctx,
        { examBot, user, chatId, attemptId: ids.attemptId },
        { ...buildFinishedScreen(attempt, false), album: [] },
        { via: 'edit', withAlbum: false },
        now,
      );
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

    const existingAnswer = attempt.answers.find((a) => a.itemId === question.itemId);
    const current = existingAnswer?.optionIds ?? [];
    const optionIds = nextOptionIds(current, option.id, question.kind === 'multiple');
    // Существующий text сохраняется как есть (ADR-0146) — это объяснение
    // выбора у вопроса с askReason, замена ответа вариантом не должна его
    // стирать (mergeAnswers заменяет ответ по itemId целиком).
    const updated = await examBot.saveAnswer(
      ids.attemptId,
      user,
      {
        itemId: question.itemId,
        optionIds,
        ...(existingAnswer?.text !== undefined ? { text: existingAnswer.text } : {}),
      },
      now,
    );

    // `single` — выбор одного варианта завершает вопрос, экран сам
    // переходит к следующему; на последнем вопросе остаёмся на месте —
    // «Сдать» в навигации уже виден, отдельного авто-перехода в отправку нет
    // (ТЗ: «Сдать» — явное действие, не последствие ответа). Вопрос с
    // askReason (ADR-0146) не переходит даже так: ответ не закончен, пока не
    // написано объяснение — экран остаётся на месте и ждёт текст сообщением.
    const nextIndex =
      question.kind === 'single' &&
      !question.askReason &&
      ids.questionIndex < questions.length - 1
        ? ids.questionIndex + 1
        : ids.questionIndex;
    const view = await renderAttemptScreen(botSessions, chatId, updated, nextIndex, now);
    // Тот же вопрос (переключение варианта в multiple, или single на
    // последнем) — альбом уже над экраном, слать его снова незачем
    // (ADR-0035, комментарий у presentAttemptScreen).
    await presentAttemptScreen(
      ctx,
      { examBot, user, chatId, attemptId: ids.attemptId },
      view,
      { via: 'edit', withAlbum: nextIndex !== ids.questionIndex },
      now,
    );
  } catch (err) {
    await reportExamActionError(ctx, err, 'answer');
  }
}

export async function handleExamSubmit(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  user: UserLean,
  chatId: number,
  attemptId: string,
  now: DateTime,
): Promise<void> {
  try {
    const deps = { examBot, botSessions, user, chatId, attemptId };
    if (await presentMissingReason(ctx, deps, now)) return;
    const attempt = await examBot.submitAttempt(attemptId, user, now);
    const view = await renderAttemptScreen(botSessions, chatId, attempt, 0, now, true);
    // Финальный экран — без альбома (renderAttemptScreen отдаёт пустой,
    // попытка уже не in_progress), withAlbum не важен.
    await presentAttemptScreen(
      ctx,
      { examBot, user, chatId, attemptId },
      view,
      { via: 'edit', withAlbum: true },
      now,
    );
  } catch (err) {
    await reportExamActionError(ctx, err, 'answer');
  }
}
