// Видео экзамена сообщением боту (ADR-0023, docs/PLAN.md §11 слой 4.5) —
// диспетчер message.handler.ts зовёт либо после /start exam_<attemptId>
// (StartHandler, deep link из кабинета), либо с экрана вопроса-видео внутри
// потока вопросов бота (ТЗ 4б.2 часть 2) — оба заводят ожидание kind:
// 'examMedia' в BotSessionService, единственном хранилище диалоговых
// ожиданий бота (CLAUDE.md «не заводи второе»), различаются `questionIndex`
// (bot-session.schema.ts, комментарий у kind). В отличие от темы/записи ждём
// ЛЮБОГО пользователя, не только штат школы — экзамен сдают ученики, в т.ч.
// анонимного отправителя без аккаунта (deep link открыт кому угодно,
// ADR-0023); привязка проверяется в MediaAssetsService (SECURITY §3): чужой
// или несуществующий attemptId не даёт ничего. Но ИЗВЕСТНОГО человека со
// статусом blocked/invited видео принимать нельзя (SECURITY §9, ADR-0026) —
// поэтому личность идёт через BotUserAccessService.resolve(), не напрямую
// UsersService: `unknown` (нет аккаунта) остаётся анонимной отправкой как
// раньше, `denied` — отказ и закрытая сессия, `active` — обычный пользователь.
//
// Пересылка учителю — `copyMessage` по `file_id`, без перезаливки (ADR-0023):
// подпись («кто, какой экзамен») шлём отдельным сообщением ДО копии — у
// video_note («кружок») подписи не бывает вовсе, единый приём для всех видов
// вложения проще, чем разбирать, что поддерживает caption у copyMessage, а
// что нет.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage } from '../../common/error-info';
import { MediaAssetsService } from '../../media/media-assets.service';
import { BotUserAccessService } from '../bot-user-access.service';
import type { BotSessionLean } from '../bot-session.service';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { PersonalChats, type PersonalChat } from '../personal-chats';
import { renderExamMediaAnswer } from './exam-media-answer';
import { extractExamVideoSource } from './exam-video-source';

const NOT_A_VIDEO_MESSAGE =
  'Ждём видео для экзамена: видеосообщение, «кружок» или файл с видео. Пришлите его сюда.';
const ATTEMPT_GONE_MESSAGE =
  'Не нашли эту попытку — возможно, её отменили. Откройте экзамен в кабинете ещё раз.';
const RECEIVED_MESSAGE = 'Видео получено, спасибо! Учитель уже может его посмотреть.';

@Injectable()
export class ExamMediaMessageHandler {
  private readonly logger = new Logger(ExamMediaMessageHandler.name);

  constructor(
    private readonly botSessions: BotSessionService,
    private readonly mediaAssets: MediaAssetsService,
    private readonly botAccess: BotUserAccessService,
    private readonly personalChats: PersonalChats,
    private readonly examBotPorts: ExamBotPortRegistry,
  ) {}

  async handle(
    ctx: Context,
    telegramId: number,
    session: BotSessionLean,
    now: DateTime,
  ): Promise<void> {
    if (!session.attemptId) return; // невозможное состояние — защита в глубину
    const source = extractExamVideoSource(ctx.message);
    if (!source) {
      await ctx.reply(NOT_A_VIDEO_MESSAGE).catch(() => null);
      return;
    }

    const access = await this.botAccess.resolve(telegramId);
    if (access.kind === 'denied') {
      await this.botSessions.clear(telegramId);
      await ctx.reply(access.message).catch(() => null);
      return;
    }
    // `unknown` — анонимная отправка без аккаунта, разрешена по замыслу
    // deep link (ADR-0023): `attachTelegramVideo` тогда получает
    // `userId: undefined`, как и раньше.
    const user = access.kind === 'active' ? access.user : undefined;
    const attached = await this.mediaAssets.attachTelegramVideo(
      session.attemptId.toString(),
      user?.id,
      source,
      now,
    );
    await this.botSessions.clear(telegramId);
    if (!attached) {
      await ctx.reply(ATTEMPT_GONE_MESSAGE).catch(() => null);
      return;
    }

    await this.forwardToTeachers(ctx, user?.name ?? 'Ученик', attached.examTitle, now);

    // Вопрос-видео потока бота (ТЗ 4б.2 часть 2) — сразу следующий экран,
    // не отдельное «получено» (сам переход это и подтверждает); deep link
    // из кабинета (ADR-0023) — экрана вопроса нет, обычное подтверждение.
    if (session.questionIndex != null && user) {
      await renderExamMediaAnswer(
        ctx,
        this.examBotPorts.get(),
        this.botSessions,
        telegramId,
        user,
        session.attemptId.toString(),
        session.questionIndex,
        now,
      );
      return;
    }
    await ctx.reply(RECEIVED_MESSAGE).catch(() => null);
  }

  private async forwardToTeachers(
    ctx: Context,
    studentName: string,
    examTitle: string,
    now: DateTime,
  ): Promise<void> {
    const message = ctx.message;
    const chat = ctx.chat;
    if (!chat || !message) return;

    const chats = await this.personalChats.list(now);
    const caption = `Видео от ${studentName} — экзамен «${examTitle}».`;
    await Promise.all(
      chats.map((teacherChat: PersonalChat) =>
        this.forwardOne(ctx, teacherChat.chatId, chat.id, message.message_id, caption),
      ),
    );
  }

  private async forwardOne(
    ctx: Context,
    toChatId: string,
    fromChatId: number,
    messageId: number,
    caption: string,
  ): Promise<void> {
    try {
      await ctx.telegram.sendMessage(toChatId, caption);
      await ctx.telegram.copyMessage(toChatId, fromChatId, messageId);
    } catch (err) {
      // chatId — полем объекта, не в тексте (SECURITY §1 п.2, §4).
      this.logger.warn(
        { chatId: toChatId },
        `telegram.examMedia.forward: ${errorMessage(err)}`,
      );
    }
  }
}
