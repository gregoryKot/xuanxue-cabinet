// Привязка почты к уже вошедшему человеку (ADR-0059) — обратная сторона
// связки Telegram (ADR-0034, users/telegram-link.service.ts): там код из
// кабинета уходит в Telegram и бот ставит telegramId, здесь ссылка из письма
// уходит на почту и подтверждение ставит email. Живёт в auth/, а не в
// users/: сервису нужен MailService, а UsersModule → MailModule закольцевало
// бы граф модулей (MailExamNotifier уже ходит в UsersService в обратную
// сторону, users/mail-exam-notifier не заводим). AuthModule уже импортирует
// и UsersModule, и MailModule — цикла нет.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  EMAIL_CONFIRM_EXPIRED_MESSAGE,
  EMAIL_LINK_OTHER_EMAIL_MESSAGE,
  EMAIL_LINK_TAKEN_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import {
  ConflictError,
  ForbiddenError,
  NotAvailableError,
  UnauthorizedError,
} from '../common/errors';
import { MailService } from '../mail/mail.service';
import { EmailLinkTokenService } from '../users/email-link-token.service';
import { UserEmailService } from '../users/user-email.service';
import { UsersService, type UserLean } from '../users/users.service';
import { emailLoginPublicUrl } from './email-login-config';

@Injectable()
export class EmailLinkService {
  constructor(
    private readonly config: ConfigService,
    private readonly tokens: EmailLinkTokenService,
    private readonly userEmailService: UserEmailService,
    private readonly usersService: UsersService,
    private readonly mail: MailService,
  ) {}

  /**
   * Адрес сохраняем в `pendingEmail` ДО отправки письма — обратный порядок
   * рискует ссылкой, которой нечего подтверждать: сбой между отправкой и
   * записью оставил бы человека с письмом на руках и без токена в базе.
   * Запись первой хотя бы гарантирует пару «pendingEmail есть» и «токен
   * существует», прежде чем письмо вообще пробует уйти.
   */
  async link(user: UserLean, email: string, now: DateTime): Promise<void> {
    const publicUrl = emailLoginPublicUrl(this.config);
    if (!publicUrl) throw new NotAvailableError(EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE);

    const normalized = email.toLowerCase();
    if (user.email === normalized) return; // идемпотентно: уже подтверждён

    if (user.email != null) throw new ConflictError(EMAIL_LINK_OTHER_EMAIL_MESSAGE);
    if (await this.userEmailService.isEmailTaken(normalized)) {
      throw new ConflictError(EMAIL_LINK_TAKEN_MESSAGE);
    }

    await this.userEmailService.setPendingEmail(user.id, normalized);
    const token = await this.tokens.issue(user.id, normalized, now);
    const link = `${publicUrl}/email/confirm?token=${token}`;
    await this.mail.sendEmailConfirmLink({ to: normalized, link });
  }

  /**
   * Токен потребляется ДО всех проверок ниже (EmailLinkTokenService.consume,
   * findOneAndDelete) — одноразовость важнее удобства, дословно тот же довод,
   * что в TelegramLinkService.linkByCode: ссылка могла уйти постороннему, и
   * она обязана сгореть с первого использования, даже если дальше
   * подтверждение не удалось.
   *
   * Заблокированный аккаунт — отказ без записи email (ADR-0034): иначе
   * привязка стала бы ключом входа, который включится сам, когда админ
   * вернёт доступ кнопкой «Открыть доступ» — тот же сценарий, ради которого
   * связка Telegram отказывает заблокированному тем же путём.
   *
   * Сессию не выпускает и cookie не ставит — привязка почты к уже вошедшему
   * человеку не должна становиться побочным входом (ADR-0059, главное
   * свойство фичи).
   */
  async confirm(token: string, now: DateTime): Promise<void> {
    const owner = await this.tokens.consume(token, now);
    if (!owner) throw new UnauthorizedError(EMAIL_CONFIRM_EXPIRED_MESSAGE);

    const user = await this.usersService.findById(owner.userId);
    if (!user) throw new UnauthorizedError(EMAIL_CONFIRM_EXPIRED_MESSAGE);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    const result = await this.userEmailService.confirmEmail(user.id, owner.email);
    if (result === 'taken') throw new ConflictError(EMAIL_LINK_TAKEN_MESSAGE);
    if (result === 'stale') throw new UnauthorizedError(EMAIL_CONFIRM_EXPIRED_MESSAGE);
  }
}
