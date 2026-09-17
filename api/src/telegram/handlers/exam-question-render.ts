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
//
// presentAttemptScreen — единая точка ПОКАЗА этого экрана (ADR-0035, ТЗ
// бота): картинки вариантов идут альбомом ДО экрана кнопок, поэтому у
// вопроса с картинками, показанного по кнопке (editMessageText), сперва
// нужно убрать старое сообщение-экран (иначе его кнопки повиснут выше
// альбома) и прислать новый экран уже НОВЫМ сообщением — заменяет
// replyAttemptScreen (CLAUDE.md «Дубли»: старую точку показа не оставляем
// рядом с новой).
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { ExamAttemptDto } from '@xuanxue/shared';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPort } from '../exam-bot.port';
import type { UserLean } from '../../users/users.service';
import type { BotMenu } from './bot-menu';
import { buildOptionAlbum, type OptionAlbumEntry } from './exam-question-album';
import { sendOptionAlbum } from './exam-question-album-send';
import {
  buildFinishedScreen,
  buildQuestionScreen,
  flattenAttemptQuestions,
} from './exam-question-screen';

/** Экран вопроса плюс то, что нужно ПОКАЗАТЬ перед ним — картинки вариантов,
 * если хоть у одного есть imageId (ADR-0035). Пусто у финального экрана и у
 * вопроса без картинок — тот же текст/кнопки, что раньше. */
export type AttemptScreenView = BotMenu & { album: OptionAlbumEntry[] };

export async function renderAttemptScreen(
  botSessions: BotSessionService,
  chatId: number,
  attempt: ExamAttemptDto,
  index: number,
  now: DateTime,
  justSubmitted = false,
): Promise<AttemptScreenView> {
  if (attempt.status !== 'in_progress') {
    await botSessions.clear(chatId);
    return { ...buildFinishedScreen(attempt, justSubmitted), album: [] };
  }

  const question = flattenAttemptQuestions(attempt)[index];
  if (question?.kind === 'text') {
    await botSessions.startExamTextWait(chatId, attempt.id, index, now);
  } else if (question?.kind === 'video') {
    await botSessions.startExamMediaWait(chatId, attempt.id, now, index);
  } else {
    await botSessions.clear(chatId);
  }
  const album = question ? buildOptionAlbum(question, index) : [];
  return { ...buildQuestionScreen(attempt, index), album };
}

/** `withAlbum: false` — тот же вопрос перерисовывается после переключения
 * варианта (exam-attempt-answer.ts): альбом уже над экраном, слать второй
 * раз незачем, экран просто редактируется на месте, ничего не удаляется. */
export async function presentAttemptScreen(
  ctx: Context,
  deps: { examBot: ExamBotPort; user: UserLean; chatId: number; attemptId: string },
  view: AttemptScreenView,
  options: { via: 'edit' | 'reply'; withAlbum: boolean },
): Promise<void> {
  const extra = { reply_markup: { inline_keyboard: view.buttons } };
  if (view.album.length === 0 || !options.withAlbum) {
    if (options.via === 'edit')
      await ctx.editMessageText(view.text, extra).catch(() => null);
    else await ctx.reply(view.text, extra).catch(() => null);
    return;
  }

  // Старое сообщение-экран убираем ТОЛЬКО когда оно было (кнопка,
  // editMessageText) — у ответа текстом/видео (via: 'reply') сообщения-
  // экрана, которое можно было бы отредактировать, не было вовсе.
  if (options.via === 'edit') await ctx.deleteMessage().catch(() => null);
  await sendOptionAlbum(
    ctx,
    deps.examBot,
    deps.user,
    deps.chatId,
    view.album,
    deps.attemptId,
  );
  await ctx.reply(view.text, extra).catch(() => null);
}
