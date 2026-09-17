// /start — единственная точка входа для личного чата с ботом (docs/PLAN.md
// §6, §11 слой 4.7, ADR-0015, ADR-0027). Доступ — единой точкой
// BotUserAccessService.resolve() (не UsersService.findByTelegramId напрямую,
// SECURITY §9): `active` подключается (штат — welcomeConnectedUser даёт канал
// школы, ученик — личный канал, ADR-0027), `denied` (blocked) получает
// готовый отказ, `unknown` (нет записи в users) — вежливый отказ по VOICE с
// адресом сайта школы, если он заполнен (settings.schoolSiteUrl, не PUBLIC_URL).
// Только приватный чат: Telegram шлёт /start и в группах (например, при
// добавлении бота с командой в описании) — там это не про личный канал
// человека, отвечать/создавать канал не нужно (обрабатывает my_chat_member).
//
// Разбор payload'а — parseStartPayload (start-payload.ts): три вида ссылки
// разбираются в одном месте, а не тремя функциями в теле хендлера (файл-лимит,
// тот же приём, что и вынос самих веток в отдельные файлы).
//
// `exam_<attemptId>` (ADR-0023, PLAN §11 слой 4.5) — deep link «Отправить
// видео» из кабинета, вынесен в exam-media-deep-link.ts (файл-лимит, тот же
// приём, что и join-invite-deep-link.ts). Видео привязывается только владельцу
// попытки с привязанным Telegram (ADR-0023) — незнакомцу (`unknown`, нет
// записи в users) отказ приходит сразу, до ожидания видео, а не после того,
// как он снял и прислал ролик (инцидент 2026-09-16, RUNBOOK §8.17). ИЗВЕСТНОГО
// blocked к ожиданию тоже не пускаем (SECURITY §9).
//
// `join_<code>` (ADR-0030 «Бот», ADR-0036) — та же ссылка, что и на сайте
// (join-invite-deep-link.ts): ветвление идёт через
// LoginIdentityService.resolveTelegramUser(), валидный код заводит незнакомца
// из Telegram-идентичности апдейта сразу `active`; невалидный — аккаунт не
// заводим. После успеха человек подключается тем же welcomeConnectedUser, что
// и обычный /start (иначе результаты экзаменов не доходили до второго /start —
// баг с #131, найден 2026-09-16 на аудите, #163).
//
// `link_<code>` (ADR-0034) — связка Telegram с аккаунтом, заведённым по почте
// (telegram-link-deep-link.ts): тот самый «незнакомец» из инцидента выше
// перестаёт им быть. BotUserAccessService здесь не вызывается — личность даёт
// сам код, telegramId на аккаунте ещё не стоит (комментарий в том же файле).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { SettingsService } from '../../settings/settings.service';
import { LoginIdentityService } from '../../users/login-identity.service';
import { TelegramLinkService } from '../../users/telegram-link.service';
import { BotSessionService } from '../bot-session.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { buildStrangerMessage } from './bot-menu';
import { handleExamMediaDeepLink } from './exam-media-deep-link';
import { handleInviteDeepLink } from './join-invite-deep-link';
import { parseStartPayload } from './start-payload';
import { welcomeConnectedUser } from './start-welcome';
import { handleTelegramLinkDeepLink } from './telegram-link-deep-link';

@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly channelConfig: ChannelConfigService,
    private readonly botSessions: BotSessionService,
    private readonly botAccess: BotUserAccessService,
    private readonly loginIdentity: LoginIdentityService,
    private readonly telegramLinkService: TelegramLinkService,
    private readonly config: ConfigService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    const from = ctx.from;
    if (!from) return;

    try {
      const payload = parseStartPayload(ctx);
      switch (payload?.kind) {
        case 'examMedia':
          await handleExamMediaDeepLink(ctx, from.id, payload.attemptId, now, {
            botSessions: this.botSessions,
            botAccess: this.botAccess,
          });
          return;
        case 'invite':
          await handleInviteDeepLink(ctx, from, payload.code, now, {
            loginIdentity: this.loginIdentity,
            channelConfig: this.channelConfig,
            publicUrl: this.config.get<string>('PUBLIC_URL'),
          });
          return;
        case 'telegramLink':
          await handleTelegramLinkDeepLink(
            ctx,
            payload.code,
            from.id,
            now,
            this.telegramLinkService,
          );
          return;
        case undefined:
          break; // обычный /start без payload — общий поток ниже
      }

      const access = await this.botAccess.resolve(from.id);
      if (access.kind === 'active') {
        await welcomeConnectedUser(ctx, from.id, access.user, this.channelConfig);
        return;
      }
      if (access.kind === 'denied') {
        await ctx.reply(access.message).catch(() => null);
        return;
      }
      await ctx.reply(await this.strangerMessage());
    } catch (err) {
      this.logger.error(`telegram.start: ${errorMessage(err)}`, errorStack(err));
    }
  }

  private async strangerMessage(): Promise<string> {
    const { schoolSiteUrl } = await this.settingsService.get();
    return buildStrangerMessage(schoolSiteUrl);
  }
}
