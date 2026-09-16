// Вход через Telegram-виджет (SECURITY §2, ADR-0005). Проверка подписи —
// telegram-login.ts; сессия и cookie — AuthService.issueSession, тот же
// узел, что и у остальных путей входа (ADR-0012); UserRecord — только через
// UsersService (CLAUDE.md: контроллер/сервис не лезут в Mongoose напрямую).
// Поиск/создание человека — LoginIdentityService (ADR-0030/0034): новый
// заводится только с валидной ссылкой-приглашением, статуса «ждёт
// подтверждения» больше нет (инцидент 2026-09-15).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { ACCESS_MESSAGE, type TelegramLoginInput } from '@xuanxue/shared';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { LoginIdentityService } from '../users/login-identity.service';
import { UsersService, type UserLean } from '../users/users.service';
import { AuthService } from './auth.service';
import { isValidTelegramLogin } from './telegram-login';

const NOT_AVAILABLE_MESSAGE =
  'Вход через Telegram пока не подключён. Попросите администратора включить его';
const SIGNATURE_MESSAGE =
  'Не удалось подтвердить вход через Telegram. Попробуйте ещё раз';

export interface TelegramLoginResult {
  user: UserLean;
  cookie: string;
}

@Injectable()
export class TelegramAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly loginIdentity: LoginIdentityService,
  ) {}

  /** `input` — типизированные поля (id, имя) для создания/поиска
   * пользователя; `rawBody` — сырое тело запроса для проверки подписи
   * (whitelist DTO и подписанное Telegram тело — не одно и то же множество
   * полей, см. telegram-login.ts). `inviteCode` — из query `?join=<code>`
   * (ADR-0030/0034), не из тела: подпись Telegram считается по `rawBody`
   * целиком, лишнее поле там сломало бы её. */
  async login(
    input: TelegramLoginInput,
    rawBody: Record<string, unknown>,
    now: DateTime,
    inviteCode?: string,
  ): Promise<TelegramLoginResult> {
    const botToken = this.config.get<string>('BOT_TOKEN');
    if (!botToken) throw new NotAvailableError(NOT_AVAILABLE_MESSAGE);
    if (!isValidTelegramLogin(rawBody, botToken, now)) {
      throw new UnauthorizedError(SIGNATURE_MESSAGE);
    }

    const user = await this.loginIdentity.resolveTelegramUser(
      input.id,
      fullName(input),
      inviteCode,
      now,
    );
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }
}

/** Экспортирован для join-invite-deep-link.ts (ADR-0030 «Бот», уточнение
 * владельца 2026-09-15): бот собирает то же отображаемое имя из
 * Telegram-идентичности апдейта, что и вход через виджет — вторая
 * реализация не пишется. Параметр — подмножество `TelegramLoginInput`, а не
 * сам тип: конструктору имени не нужны подпись и `auth_date`, только
 * first_name/last_name. */
export function fullName(input: { first_name: string; last_name?: string }): string {
  return [input.first_name, input.last_name].filter(Boolean).join(' ');
}
