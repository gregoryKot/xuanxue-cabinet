// Вход по одноразовой ссылке на email (ADR-0005, ADR-0029, SECURITY §2).
// Провайдер писем спрятан за MailService — этот сервис не знает деталей
// HTTP до Resend. Токен — EmailLoginTokenService (одноразовый, TTL 15
// минут, sha256 в базе). AuthService.issueSession — тот же узел выпуска
// cookie, что и у Telegram-входа (ADR-0012). Поиск/создание человека —
// LoginIdentityService (ADR-0030/0034): новый заводится только с валидной
// ссылкой-приглашением.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  EMAIL_LOGIN_EXPIRED_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
  INVITE_QUERY_PARAM,
} from '@xuanxue/shared';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { InviteLinkService } from '../users/invite-link.service';
import { LoginIdentityService } from '../users/login-identity.service';
import { UsersService, type UserLean } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { EmailLoginTokenService } from './email-login-token.service';

export interface EmailLoginResult {
  user: UserLean;
  cookie: string;
}

@Injectable()
export class EmailAuthService {
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
   * сервер реально готов её обработать. */
  isEnabled(): boolean {
    return Boolean(
      this.config.get<string>('RESEND_API_KEY') &&
      this.config.get<string>('MAIL_FROM') &&
      this.config.get<string>('PUBLIC_URL'),
    );
  }

  /** Ответ клиенту один и тот же независимо от исхода (контроллер): здесь —
   * либо реально отправленное письмо, либо тихий выход по cooldown, либо
   * NotAvailableError, если фича выключена конфигурацией. Существование
   * аккаунта нигде из этого не раскрывается. `inviteCode` (ADR-0030,
   * страница `/join/:code`) — невалидный код молча игнорируется (та же
   * причина: не раскрывать наружу, какой код настоящий), валидный уходит в
   * ссылку письма параметром `join` (`INVITE_QUERY_PARAM`), `/login/email`
   * потом шлёт его вместе с `verify()` (ADR-0034: отдельного шага
   * «присоединиться» после входа больше нет). */
  async requestLink(email: string, now: DateTime, inviteCode?: string): Promise<void> {
    const publicUrl = this.readPublicUrl();
    if (!publicUrl) throw new NotAvailableError(EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE);

    const normalized = email.toLowerCase();
    const token = await this.tokens.issue(normalized, now);
    // null — этому адресу совсем недавно уже отправляли письмо
    // (EMAIL_LOGIN_RESEND_COOLDOWN_MIN); ответ клиенту не меняется.
    if (!token) return;

    const join =
      inviteCode && (await this.inviteLinkService.isValid(inviteCode))
        ? `&${INVITE_QUERY_PARAM}=${inviteCode}`
        : '';
    const link = `${publicUrl}/login/email?token=${token}${join}`;
    await this.mail.sendLoginLink({ to: normalized, link });
  }

  async verify(
    token: string,
    now: DateTime,
    inviteCode?: string,
  ): Promise<EmailLoginResult> {
    const email = await this.tokens.consume(token, now);
    if (!email) throw new UnauthorizedError(EMAIL_LOGIN_EXPIRED_MESSAGE);

    const user = await this.loginIdentity.resolveEmailUser(email, inviteCode, now);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }

  /** `publicUrl` отдельно от `isEnabled()`: письмо собирает ссылку из него,
   * а проверка «все три переменные разом» уже сделана выше — здесь читаем
   * само значение только когда фича включена. */
  private readPublicUrl(): string | null {
    if (!this.isEnabled()) return null;
    return this.config.get<string>('PUBLIC_URL') ?? null;
  }
}
