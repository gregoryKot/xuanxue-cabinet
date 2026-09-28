// Единая точка «найти или завести человека при входе» (ADR-0030, ADR-0036) —
// используется и Telegram-, и email-входом (TelegramAuthService,
// EmailAuthService), чтобы правило не переписывалось дважды: существующий
// человек входит как обычно, код игнорируется; нового заводим ТОЛЬКО с
// валидной ссылкой-приглашением, сразу `active` — статуса «ждёт
// подтверждения» больше нет (инцидент 2026-09-15, владелец: «удаляем с
// концами»). Исключение — BOOTSTRAP_ADMIN_TELEGRAM_ID, тот заводится без
// ссылки, подтверждать его некому (ADR-0005). Проверка кода и отметка
// «вошёл по приглашению» — require-valid-invite.ts/mark-user-joined.ts:
// тот же код нужен GoogleLoginIdentityService (ADR-0145, CLAUDE.md «Дубли»).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { UserRole } from '@xuanxue/shared';
import { EmailLoginUserService } from './email-login-user.service';
import { InviteLinkService } from './invite-link.service';
import { markUserJoined } from './mark-user-joined';
import { requireValidInvite } from './require-valid-invite';
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

    await requireValidInvite(this.inviteLinkService, inviteCode);
    const user = await this.usersService.createFromTelegram({
      telegramId,
      name,
      roles: [] as UserRole[],
      status: 'active',
    });
    return markUserJoined(this.usersService, user, now);
  }

  async resolveEmailUser(
    email: string,
    inviteCode: string | undefined,
    now: DateTime,
  ): Promise<UserLean> {
    const existing = await this.emailLoginUserService.findByEmail(email);
    if (existing) return existing;

    await requireValidInvite(this.inviteLinkService, inviteCode);
    const user = await this.emailLoginUserService.createFromEmail(email);
    return markUserJoined(this.usersService, user, now);
  }
}
