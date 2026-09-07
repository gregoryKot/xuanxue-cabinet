// Единственная точка сборки бота: создаёт Telegraf-инстанс через фабрику,
// навешивает хендлеры (/start, my_chat_member — ADR-0015), регистрирует
// вебхук у Telegram при старте. Контроллер зовёт только handleUpdate() —
// сам разбор апдейта и подбор хендлера остаются здесь, не в контроллере
// (CLAUDE.md «Логика вне контроллеров»).
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';
import {
  TELEGRAM_CALL_TIMEOUT_MS,
  withTelegramSignal,
} from '../channels/telegram-client';
import { errorMessage, errorStack } from '../common/error-info';
import { ChatMemberHandler } from './handlers/chat-member.handler';
import { StartHandler } from './handlers/start.handler';
import { TELEGRAF_FACTORY, type TelegrafFactory } from './telegraf-instance';

// Литерал, не константа из app.setup.ts: там `app.setGlobalPrefix('api')` не
// экспортирует префикс наружу — заводить экспорт ради одного потребителя
// сейчас не стоит, префикс задокументирован здесь же.
export const TELEGRAM_WEBHOOK_PATH = '/api/telegram/webhook';
// callback_query добавится вместе с кнопками «Отменить»/«Изменить тему» (I2);
// пока хендлера для них нет, Telegram не должен присылать лишний тип апдейта.
const ALLOWED_UPDATES = ['message', 'my_chat_member'] as const;

@Injectable()
export class TelegramBotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf | null = null;

  constructor(
    private readonly config: ConfigService,
    @Inject(TELEGRAF_FACTORY) private readonly telegrafFactory: TelegrafFactory,
    private readonly chatMemberHandler: ChatMemberHandler,
    private readonly startHandler: StartHandler,
  ) {}

  // Не async: ни один вызов внутри не await'ится (прогрев и регистрация —
  // намеренно fire-and-forget, см. комментарий ниже), а `Promise<void>` в
  // сигнатуре нужен только для совместимости с OnApplicationBootstrap.
  onApplicationBootstrap(): void {
    const token = this.config.get<string>('BOT_TOKEN');
    if (!token) {
      this.logger.warn('BOT_TOKEN не задан — бот Telegram выключен.');
      return;
    }
    const bot = this.telegrafFactory(token);
    // Свой обработчик ошибок вместо встроенного в telegraf: тот печатает весь
    // апдейт через console.error (PII мимо редакции pino, CLAUDE.md «Логи») и
    // ставит process.exitCode = 1 — процесс завершался бы кодом ошибки.
    bot.catch((err) => {
      this.logger.error(`telegram.update: ${errorMessage(err)}`, errorStack(err));
    });
    bot.start((ctx) => this.startHandler.handle(ctx));
    bot.on('my_chat_member', (ctx) => this.chatMemberHandler.handle(ctx));
    this.bot = bot;

    // Прогрев botInfo и регистрация вебхука идут в сеть — ни один не должен
    // задержать старт приложения (health-check, остальные модули), поэтому
    // не await, ошибки уходят в лог отдельным catch у каждого промиса.
    void this.ensureBotInfo(bot).catch((err) => {
      this.logger.warn(`telegram.getMe (прогрев при старте): ${errorMessage(err)}`);
    });
    void this.registerWebhook(bot).catch((err) => {
      this.logger.error(`telegram.setWebhook: ${errorMessage(err)}`, errorStack(err));
    });
  }

  /** Ответ 200 всегда — Telegram ретраит апдейт при не-200 (дубли доставки,
   * CLAUDE.md «Ошибки»/«Telegram»), поэтому любая ошибка обработки, включая
   * отказ ensureBotInfo(), уходит в error-лог, а не наружу. */
  async handleUpdate(update: Update): Promise<void> {
    if (!this.bot) return;
    try {
      await this.ensureBotInfo(this.bot);
      await this.bot.handleUpdate(update);
    } catch (err) {
      this.logger.error(`telegram.webhook: ${errorMessage(err)}`, errorStack(err));
    }
  }

  /** telegraf сам лениво зовёт `telegram.getMe()` при первом апдейте, но
   * кэширует даже ОТКЛОНЁННЫЙ промис в приватном `botInfoCall`
   * (node_modules/telegraf/lib/telegraf.js, handleUpdate) — после первого
   * сетевого сбоя бот молчал бы навсегда без единой повторной попытки. Мы
   * сами выставляем публичное `bot.botInfo` раньше, чем telegraf успевает
   * туда заглянуть, — он видит готовое значение и свой кэш не трогает; при
   * отказе просто не выставляем `botInfo`, следующий апдейт пробует снова. */
  private async ensureBotInfo(bot: Telegraf): Promise<void> {
    if (bot.botInfo) return;
    const signal = AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS);
    bot.botInfo = await bot.telegram.callApi('getMe', {}, withTelegramSignal(signal));
  }

  /** Регистрация только при полном комплекте: BOT_TOKEN (уже проверен выше),
   * PUBLIC_URL и TELEGRAM_WEBHOOK_SECRET заданы, NODE_ENV=production —
   * иначе локальная разработка на каждом старте пыталась бы перехватить
   * вебхук прод-бота. `new URL(path, base)`, не конкатенация строк: устойчиво
   * к завершающему слэшу в PUBLIC_URL (валидатор его и так запрещает —
   * вторая линия защиты от «//» в пути). */
  private async registerWebhook(bot: Telegraf): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV');
    const publicUrl = this.config.get<string>('PUBLIC_URL');
    const secretToken = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (nodeEnv !== 'production' || !publicUrl || !secretToken) {
      this.logger.warn(
        'Вебхук бота не зарегистрирован: нужны production, PUBLIC_URL и ' +
          'TELEGRAM_WEBHOOK_SECRET (RUNBOOK §5).',
      );
      return;
    }
    const url = new URL(TELEGRAM_WEBHOOK_PATH, publicUrl).toString();
    const signal = AbortSignal.timeout(TELEGRAM_CALL_TIMEOUT_MS);
    await bot.telegram.callApi(
      'setWebhook',
      { url, secret_token: secretToken, allowed_updates: [...ALLOWED_UPDATES] },
      withTelegramSignal(signal),
    );
  }
}
