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
// Второй payload формата `exam_<attemptId>` (ADR-0023, PLAN §11 слой 4.5) —
// deep link «Отправить видео» из кабинета, открыт ЛЮБОМУ пользователю
// Telegram: заводит ожидание видео в BotSessionService раньше проверки роли.
// Владение попыткой не проверяется — ответ одинаков для чужого и
// несуществующего attemptId (SECURITY §3), саму привязку проверяет
// MediaAssetsService, когда видео придёт. ИЗВЕСТНОГО blocked к ожиданию не
// пускаем (SECURITY §9) — BotUserAccessService.resolve() перед стартом
// ожидания, `unknown` по-прежнему проходит без роли.
//
// Третий payload `join_<code>` (ADR-0030 «Бот», ADR-0034) — та же ссылка,
// что и на сайте (join-invite-deep-link.ts): валидный код заводит
// незнакомца из Telegram-идентичности апдейта сразу `active`; невалидный —
// аккаунт не заводим.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { INVITE_CODE_RE, INVITE_TELEGRAM_START_PREFIX } from '@xuanxue/shared';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { errorMessage, errorStack } from '../../common/error-info';
import { SettingsService } from '../../settings/settings.service';
import { InviteLinkService } from '../../users/invite-link.service';
import { UsersService } from '../../users/users.service';
import { BotSessionService } from '../bot-session.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { buildStrangerMessage } from './bot-menu';
import { handleInviteDeepLink } from './join-invite-deep-link';
import { welcomeConnectedUser } from './start-welcome';

const EXAM_MEDIA_PAYLOAD_PATTERN = /^exam_([0-9a-fA-F]{24})$/;

/** Текст после `/start ` — Telegraf типизирует `ctx.startPayload` только
 * внутри своего `bot.start()` (composer.d.ts, `StartContextExtn`), а не на
 * общем `Context`, поэтому читаем сырой текст сообщения тем же приёмом, что
 * и остальные хендлеры (recording-source.ts) — без кастов и без потери типа. */
function startPayload(ctx: Context): string | undefined {
  const message = ctx.message;
  if (!message || !('text' in message)) return undefined;
  const [, payload] = message.text.split(' ');
  return payload;
}

/** `null` — не deep link на видео экзамена (обычный /start, чужая команда). */
function examAttemptIdFromPayload(payload: string | undefined): string | null {
  const attemptId = payload?.match(EXAM_MEDIA_PAYLOAD_PATTERN)?.[1];
  return attemptId && Types.ObjectId.isValid(attemptId) ? attemptId : null;
}

/** `null` — не ссылка-приглашение (обычный /start, чужая команда, битый
 * код) — формат сверяем тем же `INVITE_CODE_RE`, что и DTO `/auth/join`. */
function inviteCodeFromPayload(payload: string | undefined): string | null {
  if (!payload?.startsWith(INVITE_TELEGRAM_START_PREFIX)) return null;
  const code = payload.slice(INVITE_TELEGRAM_START_PREFIX.length);
  return INVITE_CODE_RE.test(code) ? code : null;
}

const EXAM_MEDIA_WAIT_MESSAGE =
  'Снимите или пришлите видео прямо сюда — обычным сообщением, «кружком» ' +
  'или файлом. Как только дойдёт, учитель сможет его посмотреть.';

@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly channelConfig: ChannelConfigService,
    private readonly botSessions: BotSessionService,
    private readonly botAccess: BotUserAccessService,
    private readonly usersService: UsersService,
    private readonly inviteLinkService: InviteLinkService,
    private readonly config: ConfigService,
  ) {}

  async handle(ctx: Context, now: DateTime): Promise<void> {
    if (ctx.chat?.type !== 'private') return;
    const from = ctx.from;
    if (!from) return;

    try {
      const payload = startPayload(ctx);
      const examAttemptId = examAttemptIdFromPayload(payload);
      if (examAttemptId) {
        await this.handleExamDeepLink(ctx, from.id, examAttemptId, now);
        return;
      }
      const inviteCode = inviteCodeFromPayload(payload);
      if (inviteCode) {
        await handleInviteDeepLink(ctx, from, inviteCode, now, {
          usersService: this.usersService,
          inviteLinkService: this.inviteLinkService,
          publicUrl: this.config.get<string>('PUBLIC_URL'),
        });
        return;
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

  /** `unknown` — анонимный отправитель без аккаунта, ожидание заводим как
   * раньше (комментарий вверху файла). `denied` — известный blocked,
   * ожидание НЕ заводим и отвечаем отказом, не «пришлите видео»: тихо
   * пускать заблокированного к отправке — не вариант (SECURITY §9). */
  private async handleExamDeepLink(
    ctx: Context,
    telegramId: number,
    examAttemptId: string,
    now: DateTime,
  ): Promise<void> {
    const access = await this.botAccess.resolve(telegramId);
    if (access.kind === 'denied') {
      await ctx.reply(access.message).catch(() => null);
      return;
    }
    await this.botSessions.startExamMediaWait(telegramId, examAttemptId, now);
    await ctx.reply(EXAM_MEDIA_WAIT_MESSAGE).catch(() => null);
  }

  private async strangerMessage(): Promise<string> {
    const { schoolSiteUrl } = await this.settingsService.get();
    return buildStrangerMessage(schoolSiteUrl);
  }
}
