// Кнопки итога проверки (ТЗ 4б.5, PLAN §12): «Зачёт»/«Доработать»/«Незачёт»
// ставят ожидание комментария (bot_sessions, kind gradeComment), «Без
// комментария» сохраняет итог сразу, «Отмена» гасит ожидание. Владение:
// проверяющий уже проверен как штат (CallbackQueryHandler.isPersonalChat до
// dispatch()), попытка — школы (SECURITY §3) — здесь только чужой/
// неизвестный attemptId получает отказ без объяснения причин.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { UsersService } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { attemptSubmittedMessage } from '../attempt-submitted-message';
import { parseGradeButtonId } from './grade-callback-id';
import { saveGradingAndReply } from './grade-comment-save';
import {
  GRADE_ATTEMPT_NOT_FOUND_MESSAGE,
  GRADE_COMMENT_CANCELLED_MESSAGE,
  GRADE_COMMENT_EXPIRED_MESSAGE,
  GRADE_COMMENT_PROMPT,
} from './grade-messages';
import {
  buildGradeOutcomeButtons,
  buildSkipCancelButtons,
} from './grade-outcome-buttons';

export async function handleGradeOutcome(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  chatId: number,
  id: string,
  now: DateTime,
): Promise<void> {
  const parsed = parseGradeButtonId(id);
  if (!parsed) return;
  const review = await examBot.loadAttemptReview(parsed.attemptId);
  if (!review) {
    await ctx.editMessageText(GRADE_ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
    return;
  }
  await botSessions.startGradeCommentWait(chatId, parsed.attemptId, parsed.outcome, now);
  await ctx
    .editMessageText(GRADE_COMMENT_PROMPT, {
      reply_markup: { inline_keyboard: buildSkipCancelButtons(parsed.attemptId) },
    })
    .catch(() => null);
}

export async function handleGradeSkip(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  usersService: UsersService,
  chatId: number,
  attemptId: string,
  now: DateTime,
): Promise<void> {
  const session = await botSessions.get(chatId, now);
  if (
    !session ||
    session.kind !== 'gradeComment' ||
    session.attemptId?.toString() !== attemptId ||
    !session.outcome
  ) {
    await ctx.editMessageText(GRADE_COMMENT_EXPIRED_MESSAGE).catch(() => null);
    return;
  }
  const grader = await usersService.findByTelegramId(chatId);
  if (!grader) return; // сессия открыта только штату — защита в глубину

  await saveGradingAndReply(
    examBot,
    botSessions,
    chatId,
    attemptId,
    session.outcome,
    // Пустая строка, не `undefined`: ExamGradingsService.grade() пишет
    // `$set` без `$unset` — непереданное поле не стёрло бы старый
    // комментарий при повторной оценке без него.
    '',
    grader,
    now,
    (text) => ctx.editMessageText(text),
  );
}

export async function handleGradeCancel(
  ctx: Context,
  botSessions: BotSessionService,
  chatId: number,
  attemptId: string,
): Promise<void> {
  await botSessions.clearIfAttempt(chatId, attemptId);
  await ctx.editMessageText(GRADE_COMMENT_CANCELLED_MESSAGE).catch(() => null);
}

/** Карточка проверки по кнопке из /проверка (grade-queue-screen.ts) — новым
 * сообщением, не editMessageText: список и карточка — разные сообщения. */
export async function handleGradeView(
  ctx: Context,
  examBot: ExamBotPort,
  attemptId: string,
  publicUrl: string | undefined,
): Promise<void> {
  const review = await examBot.loadAttemptReview(attemptId);
  if (!review) {
    await ctx.reply(GRADE_ATTEMPT_NOT_FOUND_MESSAGE).catch(() => null);
    return;
  }
  const text = attemptSubmittedMessage(review, publicUrl);
  await ctx
    .reply(text, {
      reply_markup: { inline_keyboard: buildGradeOutcomeButtons(attemptId) },
    })
    .catch(() => null);
}
