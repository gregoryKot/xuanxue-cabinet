// Видео экзамена сообщением боту (ADR-0023, docs/PLAN.md §11 слой 4.5) —
// диспетчер message.handler.ts зовёт либо после /start exam_<attemptId>
// (exam-media-deep-link.ts, deep link из кабинета), либо с экрана
// вопроса-видео внутри потока вопросов бота (ТЗ 4б.2 часть 2) — оба заводят
// ожидание kind: 'examMedia' в BotSessionService, единственном хранилище
// диалоговых ожиданий бота (CLAUDE.md «не заводи второе»), различаются
// `questionIndex` (bot-session.schema.ts, комментарий у kind). В отличие от
// темы/записи ждём любого пользователя школы, не только штат — экзамен сдают
// ученики. Личность идёт через BotUserAccessService.resolve(), не напрямую
// UsersService (SECURITY §9, ADR-0026): `active` — обычный пользователь,
// привязка проверяется в MediaAssetsService (SECURITY §3) — чужой или
// несуществующий attemptId ничего не привязывает (ATTEMPT_NOT_YOURS_MESSAGE).
// `denied` (blocked) — отказ и закрытая сессия. `unknown` (нет
// записи в users — свой Telegram ещё не привязан к кабинету) раньше уходил в
// attachTelegramVideo с userId: undefined и молча проваливался тем же
// ATTEMPT_NOT_YOURS — человек уже снял и прислал видео, а бот отвечал так,
// будто попытка чужая (инцидент 2026-09-16, RUNBOOK §8.17). Теперь для этого
// пути отказ приходит и здесь (сессия могла остаться, если её завёл старый
// код или отправитель пропал из users между deep link и присылкой видео) —
// но основной случай перехватывает exam-media-deep-link.ts ещё до ожидания.
//
// Пересылка учителю — `copyMessage` по `file_id`, без перезаливки (ADR-0023),
// подпись («кто, какой экзамен») отдельным сообщением: у video_note
// («кружок») подписи не бывает вовсе, единый приём для всех видов вложения
// проще, чем разбирать, что поддерживает caption у copyMessage, а что нет.
// Сама пересылка, состав адресатов и эскалация тихого отказа — в
// exam-media-forward.ts (аудит 2026-09, находки 1 и 2, файл-лимит CLAUDE.md).
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { MediaAssetsService } from '../../media/media-assets.service';
import { BotUserAccessService } from '../bot-user-access.service';
import type { BotSessionLean } from '../bot-session.service';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { PersonalChats } from '../personal-chats';
import { TELEGRAM_NOT_LINKED_MESSAGE } from './exam-media-deep-link';
import { forwardExamVideoToTeachers } from './exam-media-forward';
import { renderExamMediaAnswer } from './exam-media-answer';
import { extractExamVideoSource } from './exam-video-source';

const NOT_A_VIDEO_MESSAGE =
  'Ждём видео для экзамена: видеосообщение, «кружок» или файл с видео. Пришлите его сюда.';
const ATTEMPT_NOT_YOURS_MESSAGE =
  'Не нашли эту попытку среди ваших. Откройте экзамен из своего кабинета ещё раз ' +
  'или вставьте там ссылку на видео.';
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
    // `unknown` — сессия ожидания могла остаться от старого кода или от
    // отправителя, пропавшего из users между deep link и присылкой видео;
    // основной случай (незнакомец сразу) перехватывает exam-media-deep-link.ts
    // раньше, до этого хендлера. Раньше здесь всё равно звали
    // attachTelegramVideo с userId: undefined и получали тот же отказ, что у
    // чужой попытки — не объясняя, что дело в непривязанном Telegram
    // (инцидент 2026-09-16, RUNBOOK §8.17).
    if (access.kind === 'unknown') {
      await this.botSessions.clear(telegramId);
      this.logger.warn(
        `telegram.examMedia: видео не привязано — попытка ${session.attemptId.toString()}, причина sender-unknown`,
      );
      await ctx.reply(TELEGRAM_NOT_LINKED_MESSAGE).catch(() => null);
      return;
    }
    const user = access.user;
    const attached = await this.mediaAssets.attachTelegramVideo(
      session.attemptId.toString(),
      user.id,
      source,
      now,
    );
    await this.botSessions.clear(telegramId);
    if (!attached) {
      this.logger.warn(
        `telegram.examMedia: видео не привязано — попытка ${session.attemptId.toString()} не найдена или принадлежит другому аккаунту`,
      );
      await ctx.reply(ATTEMPT_NOT_YOURS_MESSAGE).catch(() => null);
      return;
    }

    await forwardExamVideoToTeachers(
      ctx,
      this.personalChats,
      user.name,
      attached.examTitle,
      session.attemptId.toString(),
      now,
    );

    // Вопрос-видео потока бота (ТЗ 4б.2 часть 2) — сразу следующий экран,
    // не отдельное «получено» (сам переход это и подтверждает); deep link
    // из кабинета (ADR-0023) — экрана вопроса нет, обычное подтверждение.
    if (session.questionIndex != null) {
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
}
