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
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_NOT_FOUND_MESSAGE,
  firstUnansweredQuestionIndex,
  getMyExamAction,
} from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import { examUserFacingError } from './exam-attempt-error';
import { CONTINUE_QUESTION_INDEX, type QuestionId } from './exam-callback-ids';
import { buildExamStartConfirmScreen } from './exam-start-confirm-screen';
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
    // Не всегда новая попытка: незакрытую сервис возвращает как есть
    // (ExamAttemptsService.start, ТЗ 4.4 п.1) — она может уже нести ответы,
    // индекс 0 показывал бы пустой первый вопрос (отзыв владельца
    // 2026-09-22, ADR-0119).
    const index = firstUnansweredQuestionIndex(attempt);
    const view = await renderAttemptScreen(botSessions, chatId, attempt, index, now);
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

/** Вопрос «Вы начинаете экзамен» перед стартом попытки с лимитом времени
 * (действие `exc`, ADR-0121, отзыв владельца 2026-09-22). Форма — честно с
 * сервера (`listMyExams`), не из callback data: id формы в кнопке пришёл от
 * нас самих на прошлом показе списка, но правило «нет лимита/действие —
 * continue → сразу handleExamStart» обязано сверяться со свежими данными, а
 * не с тем, что было в кнопке в момент показа списка. */
export async function handleExamStartConfirm(
  ctx: Context,
  examBot: ExamBotPort,
  botSessions: BotSessionService,
  user: UserLean,
  chatId: number,
  examId: string,
  now: DateTime,
): Promise<void> {
  try {
    const exams = await examBot.listMyExams(user, now);
    const exam = exams.find((item) => item.id === examId);
    if (!exam) {
      await ctx.editMessageText(EXAM_NOT_FOUND_MESSAGE).catch(() => null);
      return;
    }

    const action = getMyExamAction(exam);
    // Защита в глубину: без лимита времени или «Продолжить» (часы уже
    // тикают, вопрос запоздал бы) — сразу старт, та же граница, что у
    // getExamStartConfirm в кабинете (web/src/student/examStartConfirm.ts).
    if (!exam.timeLimitMin || (action !== 'start' && action !== 'retry')) {
      await handleExamStart(ctx, examBot, botSessions, user, chatId, examId, now);
      return;
    }

    const menu = buildExamStartConfirmScreen(examId, exam.timeLimitMin);
    await ctx
      .editMessageText(menu.text, { reply_markup: { inline_keyboard: menu.buttons } })
      .catch(() => null);
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
    // CONTINUE_QUESTION_INDEX — «Продолжить» из списка экзаменов: список не
    // знает номера вопроса заранее, здесь его находит firstUnansweredQuestionIndex.
    // Обычный индекс (Назад/Дальше) рендерится как запрошен — сюда
    // приезжает по нажатой кнопке, не по устаревшему сообщению.
    const index =
      ids.index === CONTINUE_QUESTION_INDEX
        ? firstUnansweredQuestionIndex(attempt)
        : ids.index;
    const view = await renderAttemptScreen(botSessions, chatId, attempt, index, now);
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
