// Вход по одноразовой заявке на email — ссылка и код (ADR-0005, ADR-0029,
// ADR-0104, SECURITY §2). Провайдер писем спрятан за MailService — этот
// сервис не знает деталей HTTP до Resend. Заявка — EmailLoginTokenService
// (одна запись на оба способа, TTL 15 минут, sha256 в базе). AuthService.
// issueSession — тот же узел выпуска cookie, что и у Telegram-входа
// (ADR-0012). Поиск/создание человека — LoginIdentityService (ADR-0030/0036):
// новый заводится только с валидной ссылкой-приглашением.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ACCESS_MESSAGE,
  EMAIL_LOGIN_CODE_INVALID_MESSAGE,
  EMAIL_LOGIN_EXPIRED_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
  INVITE_QUERY_PARAM,
} from '@xuanxue/shared';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { InviteLinkService } from '../users/invite-link.service';
import { LoginIdentityService } from '../users/login-identity.service';
import { UsersService, type UserLean } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { emailLoginPublicUrl } from './email-login-config';
import { EmailLoginTokenService } from './email-login-token.service';

export interface EmailLoginResult {
  user: UserLean;
  cookie: string;
}

@Injectable()
export class EmailAuthService {
  private readonly logger = new Logger(EmailAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: EmailLoginTokenService,
    private readonly mail: MailService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly inviteLinkService: InviteLinkService,
    private readonly loginIdentity: LoginIdentityService,
  ) {}

  /** Email-вход подключён конфигурацией — общая проверка для
   * `requestLink()` и `GET /auth/config` (`AuthController.getConfig`,
   * CLAUDE.md «Дубли»): экран входа показывает форму почты только когда
   * сервер реально готов её обработать. Список из трёх переменных живёт в
   * одном месте — `emailLoginPublicUrl` (email-login-config.ts), которым
   * пользуется и `EmailLinkService` (ADR-0059). */
  isEnabled(): boolean {
    return emailLoginPublicUrl(this.config) !== null;
  }

  /** Ответ клиенту один и тот же независимо от исхода (контроллер): здесь —
   * либо реально отправленное письмо, либо тихий выход по cooldown, либо
   * NotAvailableError, если фича выключена конфигурацией. Существование
   * аккаунта нигде из этого не раскрывается. `inviteCode` (ADR-0030,
   * страница `/join/:code`) — невалидный код молча игнорируется (та же
   * причина: не раскрывать наружу, какой код настоящий), валидный уходит в
   * ссылку письма параметром `join` (`INVITE_QUERY_PARAM`), `/login/email`
   * потом шлёт его вместе с `verify()` (ADR-0036: отдельного шага
   * «присоединиться» после входа больше нет). */
  async requestLink(email: string, now: DateTime, inviteCode?: string): Promise<void> {
    const publicUrl = this.readPublicUrl();
    if (!publicUrl) throw new NotAvailableError(EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE);

    const normalized = email.toLowerCase();
    const issued = await this.tokens.issue(normalized, now);
    // null — этому адресу совсем недавно уже отправляли письмо
    // (EMAIL_LOGIN_RESEND_COOLDOWN_MIN); ответ клиенту не меняется.
    if (!issued) return;

    const join =
      inviteCode && (await this.inviteLinkService.isValid(inviteCode))
        ? `&${INVITE_QUERY_PARAM}=${inviteCode}`
        : '';
    const link = `${publicUrl}/login/email?token=${issued.token}${join}`;
    try {
      await this.mail.sendLoginLink({ to: normalized, link, code: issued.code });
    } catch (err) {
      // Токен уже в базе (this.tokens.issue() выше), а письмо не ушло
      // (Resend недоступен/таймаут) — не снять токен нельзя: иначе повторный
      // запрос в окне cooldown получит от issue() null и тихо ответит 204,
      // как будто письмо было отправлено (аудит 2026-09-21, HIGH). revoke —
      // best-effort: его собственную ошибку логируем отдельно, чтобы не
      // заслонить исходную причину сбоя отправки при rethrow ниже.
      await this.tokens.revoke(normalized).catch((revokeErr: unknown) => {
        this.logger.error(
          `Не удалось снять токен email-входа после сбоя отправки письма: ${errorMessage(revokeErr)}`,
        );
      });
      throw err;
    }
  }

  /** Вход по ссылке — токен потребляется один раз (EmailLoginTokenService.
   * consume), тем же удалением сгорает и код той же заявки (ADR-0104). */
  async verify(
    token: string,
    now: DateTime,
    inviteCode?: string,
  ): Promise<EmailLoginResult> {
    const email = await this.tokens.consume(token, now);
    if (!email) throw new UnauthorizedError(EMAIL_LOGIN_EXPIRED_MESSAGE);
    return this.finishLogin(email, now, inviteCode);
  }

  /** Вход по коду из письма (ADR-0104) — второй способ потратить ту же
   * заявку, для устройства, у которого своя, отдельная от Safari кука
   * (приложение на домашнем экране айфона). Email нормализуем тем же
   * приёмом, что requestLink() — заявка в базе лежит по lowercase-адресу.
   * consumeCode не различает наружу причину отказа (неверный код, попытки
   * кончились, заявка протухла) — один текст на всё, SECURITY §2. */
  async verifyCode(
    email: string,
    code: string,
    now: DateTime,
    inviteCode?: string,
  ): Promise<EmailLoginResult> {
    const owner = await this.tokens.consumeCode(email.toLowerCase(), code, now);
    if (!owner) throw new UnauthorizedError(EMAIL_LOGIN_CODE_INVALID_MESSAGE);
    return this.finishLogin(owner, now, inviteCode);
  }

  /** Общий хвост verify()/verifyCode() (CLAUDE.md «Дубли»): найти-или-
   * завести человека, отказать заблокированному, отметить вход, выпустить
   * сессию. Различаются только способом добраться до email владельца
   * заявки — то, что происходит после, от способа не зависит. */
  private async finishLogin(
    email: string,
    now: DateTime,
    inviteCode?: string,
  ): Promise<EmailLoginResult> {
    const user = await this.loginIdentity.resolveEmailUser(email, inviteCode, now);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }

  /** Тонкая обёртка вокруг `emailLoginPublicUrl` — оставлена методом, а не
   * инлайнена в `requestLink()`, чтобы не завязывать вызывающий код на
   * прямой импорт помощника. */
  private readPublicUrl(): string | null {
    return emailLoginPublicUrl(this.config);
  }
}
