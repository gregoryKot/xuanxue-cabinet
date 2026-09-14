// Общая точка «экран попытки + ожидание бота под него» (ТЗ 4б.2 часть 2,
// ADR-0024) — text/video вопрос переводит чат в ожидание ответа сообщением
// (bot-session.service.ts, kind 'examText'/'examMedia' с номером вопроса),
// любой другой экран (single/multiple, финальный) это ожидание закрывает.
// Один документ на чат, новое ожидание вытесняет старое (bot-session.
// service.ts, комментарий к startTopicWait) — значит каждый показ экрана
// вопроса обязан переустановить его заново: ушли на другой вопрос — старое
// ожидание больше не про то, что видит ученик. Вынесено отдельно (CLAUDE.md
// «Одна механика — один компонент»): эту развилку иначе пришлось бы
// повторять в каждом хендлере, что показывает экран вопроса — навигация
// (exam-attempt-navigation.ts), ответ вариантом (exam-attempt-answer.ts),
// ответ текстом/видео (exam-text-answer.handler.ts/exam-media-message.
// handler.ts).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { BotSessionService } from '../bot-session.service';
import type { BotMenu } from './bot-menu';
import {
  buildFinishedScreen,
  buildQuestionScreen,
  flattenAttemptQuestions,
} from './exam-question-screen';

/** Экран НОВЫМ сообщением — тот же экран, что и после кнопки, но вход был не
 * кнопкой (свободный текст/видео ответа): редактировать нечего, у входящего
 * сообщения нет message_id экрана бота (exam-text-answer.handler.ts,
 * exam-media-answer.ts). */
export async function replyAttemptScreen(ctx: Context, view: BotMenu): Promise<void> {
  await ctx
    .reply(view.text, { reply_markup: { inline_keyboard: view.buttons } })
    .catch(() => null);
}

export async function renderAttemptScreen(
  botSessions: BotSessionService,
  chatId: number,
  attempt: ExamAttemptDto,
  index: number,
  now: DateTime,
  justSubmitted = false,
): Promise<BotMenu> {
  if (attempt.status !== 'in_progress') {
    await botSessions.clear(chatId);
    return buildFinishedScreen(attempt, justSubmitted);
  }

  const question = flattenAttemptQuestions(attempt)[index];
  if (question?.kind === 'text') {
    await botSessions.startExamTextWait(chatId, attempt.id, index, now);
  } else if (question?.kind === 'video') {
    await botSessions.startExamMediaWait(chatId, attempt.id, now, index);
  } else {
    await botSessions.clear(chatId);
  }
  return buildQuestionScreen(attempt, index);
}
