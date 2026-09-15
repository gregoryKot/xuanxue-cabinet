// Единственная точка сборки бота: Telegraf-инстанс через фабрику, хендлеры
// (ADR-0015), вебхук и меню команд при старте. Контроллер зовёт только
// handleUpdate() — разбор апдейта остаётся здесь, не в контроллере.
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Telegraf } from 'telegraf';
import type { InlineKeyboardButton, Update } from 'telegraf/types';
import { errorMessage, errorStack } from '../common/error-info';
import { BotIdentityService } from './bot-identity.service';
import { ensureBotInfo, registerWebhook } from './bot-startup';
import { sendBotMessage } from './bot-send';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { ChatMemberJoinHandler } from './handlers/chat-member-join.handler';
import { ExamCommandHandler } from './handlers/exam-command.handler';
import { MessageHandler } from './handlers/message.handler';
import { MenuCommandHandler } from './handlers/menu-command.handler';
import { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import { StartHandler } from './handlers/start.handler';
import { TopicCommandHandler } from './handlers/topic-command.handler';
import { registerHandlers } from './register-handlers';
import { registerBotCommands } from './bot-commands';
import { TELEGRAF_FACTORY, type TelegrafFactory } from './telegraf-instance';

// Реэкспорт для существующих потребителей (телеграм-контроллер, тесты) —
// путь вебхука теперь объявлен в bot-startup.ts вместе с его регистрацией.
export { TELEGRAM_WEBHOOK_PATH } from './bot-startup';

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(TELEGRAF_FACTORY) private readonly telegrafFactory: TelegrafFactory,
    private readonly chatMemberHandler: ChatMemberHandler,
    private readonly chatMemberJoinHandler: ChatMemberJoinHandler,
    private readonly startHandler: StartHandler,
    private readonly callbackQueryHandler: CallbackQueryHandler,
    private readonly topicCommandHandler: TopicCommandHandler,
    private readonly notificationsCommandHandler: NotificationsCommandHandler,
    private readonly menuCommandHandler: MenuCommandHandler,
    private readonly messageHandler: MessageHandler,
    private readonly examCommandHandler: ExamCommandHandler,
    private readonly botIdentity: BotIdentityService,
  ) {}

  // Не async: внутри всё намеренно fire-and-forget (см. ниже).
  onApplicationBootstrap(): void {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) {
      this.logger.warn('BOT_TOKEN не задан — бот Telegram выключен.');
      return;
    }
    const bot = this.telegrafFactory(token);
    // Свой обработчик ошибок вместо встроенного в telegraf: тот печатает
    // апдейт целиком через console.error (PII мимо редакции pino) и ставит
    // process.exitCode = 1 — процесс завершался бы кодом ошибки.
    bot.catch((err) => {
      this.logger.error(`telegram.update: ${errorMessage(err)}`, errorStack(err));
    });
    registerHandlers(bot, {
      chatMemberHandler: this.chatMemberHandler,
      chatMemberJoinHandler: this.chatMemberJoinHandler,
      startHandler: this.startHandler,
      callbackQueryHandler: this.callbackQueryHandler,
      topicCommandHandler: this.topicCommandHandler,
      notificationsCommandHandler: this.notificationsCommandHandler,
      menuCommandHandler: this.menuCommandHandler,
      messageHandler: this.messageHandler,
      examCommandHandler: this.examCommandHandler,
    });
    this.bot = bot;

    // Сетевые вызовы старта — не await, ошибки в лог: они не должны
    // задерживать подъём приложения. Пустое меню команд читается как
    // «бот ничего не умеет» (bot-commands.ts), поэтому оно тоже здесь.
    void ensureBotInfo(bot)
      .then(() => this.syncBotIdentity())
      .catch((err) => {
        this.logger.warn(`telegram.getMe (прогрев при старте): ${errorMessage(err)}`);
      });
    void registerWebhook(bot, this.config, this.logger).catch((err) => {
      this.logger.error(`telegram.setWebhook: ${errorMessage(err)}`, errorStack(err));
    });
    void registerBotCommands(bot).catch((err) => {
      this.logger.warn(`telegram.setMyCommands: ${errorMessage(err)}`);
    });
  }

  /** Ответ 200 всегда — Telegram ретраит апдейт при не-200 (дубли доставки),
   * поэтому любая ошибка обработки уходит в error-лог, а не наружу. */
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot) return;
    try {
      await ensureBotInfo(this.bot);
      this.syncBotIdentity();
      await this.bot.handleUpdate(update);
    } catch (err) {
      this.logger.error(`telegram.webhook: ${errorMessage(err)}`, errorStack(err));
    }
  }

  /** Проактивная отправка вне ответа на апдейт (предпросмотр, «Запись?»,
   * ручные каналы, уведомления об ошибках). Без бота — молча ничего не
   * делает; сбой сети — warn в лог, не наружу: тик планировщика не должен
   * падать из-за упавшей отправки.
   *
   * Возвращает `true`/`false` вместо прежнего `void` (аудит 2026-09, находка
   * 2): раньше сбой был виден только этому warn, вызывающий код не мог его
   * отличить от успеха — TelegramExamNotifier ловил свой `try/catch` вокруг
   * сбоев резолва чата/имени, но не вокруг самой отправки, и она молча
   * считалась успешной. Существующие вызовы (recording-prompt,
   * manual-prompt, preview.service, teacher-notifier) результат по-прежнему
   * не читают — их поведение не меняется, они как слали best-effort, так и
   * шлют; новые (TelegramExamNotifier, exam-media-forward.ts) проверяют его,
   * чтобы эскалировать тотальный сбой отдельным `error`, а не тем же `warn`. */
  async sendMessage(
    chatId: string,
    text: string,
    buttons?: InlineKeyboardButton[][],
  ): Promise<boolean> {
    if (!this.bot) return false;
    try {
      await sendBotMessage(this.bot, chatId, text, buttons);
      return true;
    } catch (err) {
      // chatId — полем объекта, не в тексте (SECURITY §1 п.2, §4): им управляет redact-paths.ts.
      this.logger.warn({ chatId }, `telegram.sendMessage: ${errorMessage(err)}`);
      return false;
    }
  }

  /** Имя бота в Telegram (`@имя`) — нужно кабинету, чтобы собрать deep link
   * «Отправить видео» (`t.me/<имя>?start=exam_<id>`, ADR-0023). Берём из
   * уже прогретого `botInfo`, не зовём getMe на каждый запрос конфигурации;
   * бота нет или прогрев не удался — `undefined`, и кнопка просто не
   * показывается (кабинет не обещает того, чего не может). */
  botUsername(): string | undefined {
    return this.bot?.botInfo?.username;
  }

  /** Зеркалит имя бота в BotIdentityService — единственный способ узнать
   * его за пределами TelegramModule (InviteLinkService, ADR-0030). Вызывать
   * после каждой точки, где `bot.botInfo` мог обновиться. */
  private syncBotIdentity(): void {
    this.botIdentity.set(this.bot?.botInfo?.username);
  }
}
