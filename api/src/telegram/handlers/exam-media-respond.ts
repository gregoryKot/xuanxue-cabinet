// Ответ ученику и учителю после успешной привязки видео (пересылка,
// следующий экран потока вопросов или подтверждение) — вынесено из
// ExamMediaMessageHandler (файл-лимит CLAUDE.md «Храповики»), тем же приёмом,
// что exam-media-forward.ts.
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { AttachedTelegramMedia } from '../../media/media-asset-insert';
import type { UserLean } from '../../users/users.service';
import type { BotSessionService } from '../bot-session.service';
import type { ExamBotPortRegistry } from '../exam-bot-port.registry';
import type { PersonalChats } from '../personal-chats';
import { renderExamMediaAnswer } from './exam-media-answer';
import { forwardExamVideoToTeachers } from './exam-media-forward';

// ADR-0095: пересылка учителю при получении — best-effort, могла не дойти
// (бота ещё не подключили, вид уведомления выключен) — «уже может
// посмотреть» обещало то, чего могло не случиться. Кнопка на карточке
// проверки достаёт то же видео заново в любой момент, поэтому это по-прежнему
// честно и без «уже».
const RECEIVED_MESSAGE =
  'Видео дошло, спасибо! Сохранили его к попытке — учитель сможет посмотреть.';

export interface RespondToAttachedMediaDeps {
  personalChats: PersonalChats;
  botSessions: BotSessionService;
  examBotPorts: ExamBotPortRegistry;
}

export async function respondToAttachedMedia(
  ctx: Context,
  deps: RespondToAttachedMediaDeps,
  attached: AttachedTelegramMedia,
  user: UserLean,
  telegramId: number,
  attemptId: string,
  questionIndex: number | null | undefined,
  now: DateTime,
): Promise<void> {
  await forwardExamVideoToTeachers(
    ctx,
    deps.personalChats,
    user.name,
    attached.examTitle,
    attemptId,
    now,
  );

  // Вопрос-видео потока бота (ТЗ 4б.2 часть 2) — сразу следующий экран,
  // не отдельное «получено» (сам переход это и подтверждает); deep link
  // из кабинета (ADR-0023) — экрана вопроса нет, обычное подтверждение.
  if (questionIndex != null) {
    await renderExamMediaAnswer(
      ctx,
      deps.examBotPorts.get(),
      deps.botSessions,
      telegramId,
      user,
      attemptId,
      questionIndex,
      now,
    );
    return;
  }
  await ctx.reply(RECEIVED_MESSAGE).catch(() => null);
}
