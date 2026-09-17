// Единая точка «найти или завести человека при входе» (ADR-0030, ADR-0036) —
// используется и Telegram-, и email-входом (TelegramAuthService,
// EmailAuthService), чтобы правило не переписывалось дважды: существующий
// человек входит как обычно, код игнорируется; нового заводим ТОЛЬКО с
// валидной ссылкой-приглашением, сразу `active` — статуса «ждёт
// подтверждения» больше нет (инцидент 2026-09-15, владелец: «удаляем с
// концами»). Исключение — BOOTSTRAP_ADMIN_TELEGRAM_ID, тот заводится без
// ссылки, подтверждать его некому (ADR-0005).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { NO_INVITE_LINK_MESSAGE, type UserRole } from '@xuanxue/shared';
import { ForbiddenError } from '../common/errors';
import { EmailLoginUserService } from './email-login-user.service';
import { InviteLinkService } from './invite-link.service';
import { UsersService, type UserLean } from './users.service';

@Injectable()
export class LoginIdentityService {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly emailLoginUserService: EmailLoginUserService,
    private readonly inviteLinkService: InviteLinkService,
  ) {}

  /** `name` — уже посчитанное отображаемое имя (TelegramAuthService.fullName
   * или сырое имя апдейта бота) — сервис не знает формата Telegram-полей. */
  async resolveTelegramUser(
    telegramId: number,
    name: string,
    inviteCode: string | undefined,
    now: DateTime,
  ): Promise<UserLean> {
    const existing = await this.usersService.findByTelegramId(telegramId);
    if (existing) return existing;

    const bootstrapId = this.config.get<number>('BOOTSTRAP_ADMIN_TELEGRAM_ID');
    if (bootstrapId === telegramId) {
      return this.usersService.createFromTelegram({
        telegramId,
        name,
        roles: ['admin', 'teacher'],
        status: 'active',
      });
    }

    await this.requireValidInvite(inviteCode);
    const user = await this.usersService.createFromTelegram({
      telegramId,
      name,
      roles: [] as UserRole[],
      status: 'active',
    });
    return this.markJoined(user, now);
  }

  async resolveEmailUser(
    email: string,
    inviteCode: string | undefined,
    now: DateTime,
  ): Promise<UserLean> {
    const existing = await this.emailLoginUserService.findByEmail(email);
    if (existing) return existing;

    await this.requireValidInvite(inviteCode);
    const user = await this.emailLoginUserService.createFromEmail(email);
    return this.markJoined(user, now);
  }

  /** Код нужен только для нового человека — известного пропускаем мимо этой
   * проверки выше (существующий вход игнорирует код, ADR-0036). */
  private async requireValidInvite(inviteCode: string | undefined): Promise<void> {
    const isValid = inviteCode ? await this.inviteLinkService.isValid(inviteCode) : false;
    if (!isValid) throw new ForbiddenError(NO_INVITE_LINK_MESSAGE);
  }

  private async markJoined(user: UserLean, now: DateTime): Promise<UserLean> {
    await this.usersService.markJoinedViaInvite(user.id, now);
    return { ...user, joinedViaInviteAt: now.toJSDate() };
  }
}
