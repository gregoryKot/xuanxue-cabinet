// Вход через Telegram-виджет (SECURITY §2, ADR-0005). Проверка подписи —
// telegram-login.ts; сессия и cookie — AuthService.issueSession, тот же
// узел, что и у остальных путей входа (ADR-0012); UserRecord — только через
// UsersService (CLAUDE.md: контроллер/сервис не лезут в Mongoose напрямую).
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { TelegramLoginInput, UserRole } from '@xuanxue/shared';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { UsersService, type UserLean } from '../users/users.service';
import { AuthService } from './auth.service';
import { isValidTelegramLogin } from './telegram-login';

const NOT_AVAILABLE_MESSAGE =
  'Вход через Telegram пока не подключён. Попросите администратора включить его';
const SIGNATURE_MESSAGE =
  'Не удалось подтвердить вход через Telegram. Попробуйте ещё раз';
const ACCESS_MESSAGE = 'Доступа нет. Обратитесь к администратору школы.';

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
  ) {}

  /** `input` — типизированные поля (id, имя) для создания/поиска
   * пользователя; `rawBody` — сырое тело запроса для проверки подписи
   * (whitelist DTO и подписанное Telegram тело — не одно и то же множество
   * полей, см. telegram-login.ts). */
  async login(
    input: TelegramLoginInput,
    rawBody: Record<string, unknown>,
    now: DateTime,
  ): Promise<TelegramLoginResult> {
    const botToken = this.config.get<string>('BOT_TOKEN');
    if (!botToken) throw new NotAvailableError(NOT_AVAILABLE_MESSAGE);
    if (!isValidTelegramLogin(rawBody, botToken, now)) {
      throw new UnauthorizedError(SIGNATURE_MESSAGE);
    }

    const existing = await this.usersService.findByTelegramId(input.id);
    const user = existing ?? (await this.createUser(input));
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }

  /** Роли по умолчанию пустые — ученик появляется как `active` без ролей
   * (ADR-0026); первый вход с BOOTSTRAP_ADMIN_TELEGRAM_ID получает
   * admin+teacher (CLAUDE.md «Кабинет учителя»: дальше роли назначаются в
   * интерфейсе, не в env).
   *
   * Статус нового человека — `invited`: ссылки и пароли Zoom видит только
   * тот, кого школа подтвердила (SECURITY §2, угроза №1 — зум-бомбинг).
   * Первый админ — исключение: подтверждать его некому. */
  private async createUser(input: TelegramLoginInput): Promise<UserLean> {
    const bootstrapId = this.config.get<number>('BOOTSTRAP_ADMIN_TELEGRAM_ID');
    const isBootstrapAdmin = bootstrapId === input.id;
    const roles: UserRole[] = isBootstrapAdmin ? ['admin', 'teacher'] : [];
    return this.usersService.createFromTelegram({
      telegramId: input.id,
      name: fullName(input),
      roles,
      status: isBootstrapAdmin ? 'active' : 'invited',
    });
  }
}

function fullName(input: TelegramLoginInput): string {
  return [input.first_name, input.last_name].filter(Boolean).join(' ');
}
