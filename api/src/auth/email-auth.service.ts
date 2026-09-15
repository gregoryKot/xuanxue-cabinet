// Вход по одноразовой ссылке на email (ADR-0005, ADR-0029, SECURITY §2).
// Провайдер писем спрятан за MailService — этот сервис не знает деталей
// HTTP до Resend. Токен — EmailLoginTokenService (одноразовый, TTL 15
// минут, sha256 в базе). AuthService.issueSession — тот же узел выпуска
// cookie, что и у Telegram-входа (ADR-0012).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  EMAIL_LOGIN_EXPIRED_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { EmailLoginUserService } from '../users/email-login-user.service';
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
    private readonly emailUsers: EmailLoginUserService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  /** Ответ клиенту один и тот же независимо от исхода (контроллер): здесь —
   * либо реально отправленное письмо, либо тихий выход по cooldown, либо
   * NotAvailableError, если фича выключена конфигурацией. Существование
   * аккаунта нигде из этого не раскрывается. */
  async requestLink(email: string, now: DateTime): Promise<void> {
    const cfg = this.readConfig();
    if (!cfg) throw new NotAvailableError(EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE);

    const normalized = email.toLowerCase();
    const token = await this.tokens.issue(normalized, now);
    // null — этому адресу совсем недавно уже отправляли письмо
    // (EMAIL_LOGIN_RESEND_COOLDOWN_MIN); ответ клиенту не меняется.
    if (!token) return;

    const link = `${cfg.publicUrl}/login/email?token=${token}`;
    await this.mail.sendLoginLink({ to: normalized, link });
  }

  async verify(token: string, now: DateTime): Promise<EmailLoginResult> {
    const email = await this.tokens.consume(token, now);
    if (!email) throw new UnauthorizedError(EMAIL_LOGIN_EXPIRED_MESSAGE);

    const existing = await this.emailUsers.findByEmail(email);
    const user = existing ?? (await this.emailUsers.createFromEmail(email));
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }

  /** Все три переменные разом — без ссылки (PUBLIC_URL) письмо некуда
   * слать, без ключа/адреса отправителя Resend не отправит его сам
   * (MailService — вторая линия обороны на этот случай). */
  private readConfig(): { publicUrl: string } | null {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    const publicUrl = this.config.get<string>('PUBLIC_URL');
    if (!apiKey || !from || !publicUrl) return null;
    return { publicUrl };
  }
}
