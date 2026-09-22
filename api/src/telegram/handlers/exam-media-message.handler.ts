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
//
// Свой `try/catch` (находка аудита PR #175, PLAN.md §11) — без него сбой
// вроде «Mongo недоступна» уходил только в общий catch MessageHandler, тот
// логирует, но ученику не отвечает (тихий отказ, CLAUDE.md «Логи»); приём —
// как у ExamTextAnswerHandler, лог со стеком + examUserFacingError.
//
// Проверка личности (denied/unknown) — resolveActiveBotUser.ts, общая с
// PaymentScreenshotMessageHandler.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { errorMessage, errorStack } from '../../common/error-info';
import { MediaAssetsService } from '../../media/media-assets.service';
import { BotUserAccessService } from '../bot-user-access.service';
import type { BotSessionLean } from '../bot-session.lean';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { PersonalChats } from '../personal-chats';
import { examUserFacingError } from './exam-attempt-error';
import { TELEGRAM_NOT_LINKED_MESSAGE } from './exam-media-deep-link';
import { respondToAttachedMedia } from './exam-media-respond';
import { extractExamVideoSource } from './exam-video-source';
import { resolveActiveBotUser } from './resolve-active-bot-user';

const NOT_A_VIDEO_MESSAGE =
  'Видео для экзамена — видеосообщение, «кружок» или файл с видео.';
const ATTEMPT_NOT_YOURS_MESSAGE =
  'Не нашли эту попытку среди ваших. Откройте экзамен из своего кабинета ещё раз ' +
  'или вставьте там ссылку на видео.';

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

    try {
      // `unknown` — сессия осталась от старого кода/отправителя без записи в
      // users (см. шапку файла, инцидент 2026-09-16, RUNBOOK §8.17).
      const user = await resolveActiveBotUser(
        ctx,
        telegramId,
        this.botAccess,
        this.botSessions,
        TELEGRAM_NOT_LINKED_MESSAGE,
        () =>
          this.logger.warn(
            `telegram.examMedia: видео не привязано — попытка ${session.attemptId?.toString()}, причина sender-unknown`,
          ),
      );
      if (!user) return;
      const attached = await this.mediaAssets.attachTelegramVideo(
        session.attemptId.toString(),
        user.id,
        source,
        now,
        session.itemId?.toString(),
      );
      await this.botSessions.clear(telegramId);
      if (!attached) {
        this.logger.warn(
          `telegram.examMedia: видео не привязано — попытка ${session.attemptId.toString()} не найдена или принадлежит другому аккаунту`,
        );
        await ctx.reply(ATTEMPT_NOT_YOURS_MESSAGE).catch(() => null);
        return;
      }

      await respondToAttachedMedia(
        ctx,
        {
          personalChats: this.personalChats,
          botSessions: this.botSessions,
          examBotPorts: this.examBotPorts,
        },
        attached,
        user,
        telegramId,
        session.attemptId.toString(),
        session.questionIndex,
        now,
      );
    } catch (err) {
      // Неожиданный сбой (не «попытка не ваша», та ветка выше и не исключение) —
      // ученик, который прислал видео, иначе не узнал бы, снялось оно или нет
      // (находка аудита PR #175, docs/PLAN.md §11: тихий отказ — CLAUDE.md «Логи»).
      this.logger.error(`telegram.examMedia: ${errorMessage(err)}`, errorStack(err));
      await ctx.reply(examUserFacingError(err)).catch(() => null);
    }
  }
}
