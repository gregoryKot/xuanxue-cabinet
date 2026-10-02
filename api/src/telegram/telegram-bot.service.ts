// Единственная точка сборки бота: Telegraf через фабрику, хендлеры (ADR-0015),
// вебхук и меню команд при старте. Контроллер зовёт только handleUpdate().
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Telegraf, Telegram } from 'telegraf';
import type { InlineKeyboardButton, Update } from 'telegraf/types';
import type { ExamVideoTelegramType } from '../media/media-asset.schema';
import { errorMessage, errorStack } from '../common/error-info';
import { BotIdentityService } from './bot-identity.service';
import { ensureBotInfo, registerWebhook, updateErrorLogLine } from './bot-startup';
import { sendBotActionSafely } from './bot-send-safely';
import { sendBotMessage } from './bot-send';
import { sendBotExamVideo } from './bot-send-video';
import { CallbackQueryHandler } from './handlers/callback-query.handler';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { ExamCommandHandler } from './handlers/exam-command.handler';
import { GradeQueueHandler } from './handlers/grade-queue.handler';
import { MessageHandler } from './handlers/message.handler';
import { MenuCommandHandler } from './handlers/menu-command.handler';
import { NewExamCommandHandler } from './handlers/new-exam-command.handler';
import { NewExamItemCommandHandler } from './handlers/new-exam-item-command.handler';
import { NotificationsCommandHandler } from './handlers/notifications-command.handler';
import { StartHandler } from './handlers/start.handler';
import { TopicCommandHandler } from './handlers/topic-command.handler';
import { registerHandlers } from './register-handlers';
import { syncBotCommands } from './bot-commands';
import { PersonalChats } from './personal-chats';
import { TELEGRAF_FACTORY, type TelegrafFactory } from './telegraf-instance';

// Реэкспорт для контроллера и тестов — путь объявлен в bot-startup.ts.
export { TELEGRAM_WEBHOOK_PATH } from './bot-startup';

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(TELEGRAF_FACTORY) private readonly telegrafFactory: TelegrafFactory,
    private readonly chatMemberHandler: ChatMemberHandler,
    private readonly startHandler: StartHandler,
    private readonly callbackQueryHandler: CallbackQueryHandler,
    private readonly topicCommandHandler: TopicCommandHandler,
    private readonly notificationsCommandHandler: NotificationsCommandHandler,
    private readonly menuCommandHandler: MenuCommandHandler,
    private readonly messageHandler: MessageHandler,
    private readonly examCommandHandler: ExamCommandHandler,
    private readonly newExamItemCommandHandler: NewExamItemCommandHandler,
    private readonly newExamCommandHandler: NewExamCommandHandler,
    private readonly gradeQueueHandler: GradeQueueHandler,
    private readonly botIdentity: BotIdentityService,
    private readonly personalChats: PersonalChats,
  ) {}

  // Не async: внутри всё намеренно fire-and-forget (см. ниже).
  onApplicationBootstrap(): void {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) {
      this.logger.warn('BOT_TOKEN не задан — бот Telegram выключен.');
      return;
    }
    const bot = this.telegrafFactory(token);
    // Не встроенный обработчик telegraf: он пишет апдейт целиком в console.error
    // (PII мимо редакции pino) и ставит process.exitCode = 1.
    bot.catch((err) => this.logger.error(updateErrorLogLine(err), errorStack(err)));
    registerHandlers(bot, {
      chatMemberHandler: this.chatMemberHandler,
      startHandler: this.startHandler,
      callbackQueryHandler: this.callbackQueryHandler,
      topicCommandHandler: this.topicCommandHandler,
      notificationsCommandHandler: this.notificationsCommandHandler,
      menuCommandHandler: this.menuCommandHandler,
      messageHandler: this.messageHandler,
      examCommandHandler: this.examCommandHandler,
      newExamItemCommandHandler: this.newExamItemCommandHandler,
      newExamCommandHandler: this.newExamCommandHandler,
      gradeQueueHandler: this.gradeQueueHandler,
    });
    this.bot = bot;

    // Сетевые вызовы старта — не await: не задерживают подъём приложения
    // (пустое меню команд читается как «бот ничего не умеет»).
    void ensureBotInfo(bot)
      .then(() => this.syncBotIdentity())
      .catch((err) => {
        this.logger.warn(`telegram.getMe (прогрев при старте): ${errorMessage(err)}`);
      });
    void registerWebhook(bot, this.config, this.logger).catch((err) => {
      this.logger.error(`telegram.setWebhook: ${errorMessage(err)}`, errorStack(err));
    });
    void syncBotCommands(bot.telegram, this.personalChats, DateTime.utc());
  }

  /** Ответ 200 всегда — Telegram ретраит апдейт при не-200 (дубли), поэтому
   * ошибка обработки уходит в error-лог, а не наружу. */
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

  /** Проактивная отправка — обёртка bot-send-safely.ts (там же: почему `true`/`false`). */
  async sendMessage(
    chatId: string,
    text: string,
    buttons?: InlineKeyboardButton[][],
  ): Promise<boolean> {
    return sendBotActionSafely(this.bot, this.logger, chatId, 'sendMessage', (bot) =>
      sendBotMessage(bot, chatId, text, buttons),
    );
  }

  /** Видео экзамена по file_id (ADR-0023, ADR-0095) — та же обёртка. */
  async sendExamVideo(
    chatId: string,
    fileId: string,
    telegramType: ExamVideoTelegramType,
  ): Promise<boolean> {
    return sendBotActionSafely(this.bot, this.logger, chatId, 'sendExamVideo', (bot) =>
      sendBotExamVideo(bot, chatId, fileId, telegramType),
    );
  }

  /** Имя бота (`@имя`) для deep link «Отправить видео» (ADR-0023): из уже
   * прогретого `botInfo`; нет бота или прогрев не удался — `undefined`, и
   * кнопка не показывается. */
  botUsername(): string | undefined {
    return this.bot?.botInfo?.username;
  }

  /** Клиент Bot API для отправок с пути HTTP (ADR-0156); `null` — бота нет. */
  telegramClient(): Telegram | null {
    return this.bot?.telegram ?? null;
  }

  /** Зеркалит имя бота в BotIdentityService (InviteLinkService, ADR-0030) —
   * вызывать там, где `bot.botInfo` мог обновиться. */
  private syncBotIdentity(): void {
    this.botIdentity.set(this.bot?.botInfo?.username);
  }
}
