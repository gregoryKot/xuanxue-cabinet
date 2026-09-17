// Юнит-тест сервиса входа через Telegram — фейки ConfigService/UsersService/
// AuthService/LoginIdentityService, без Mongo и без HTTP (CLAUDE.md «Тесты»).
// Подпись — тем же алгоритмом, что и telegram-login.spec.ts (дубль допустим —
// файл со спеками, jscpd их не считает). Поиск/создание человека —
// LoginIdentityService (login-identity.service.spec.ts проверяет его
// ветвления отдельно); здесь — только то, что TelegramAuthService правильно
// его зовёт и реагирует на blocked/успех.
import { createHash, createHmac, randomBytes } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import type { LoginIdentityService } from '../users/login-identity.service';
import type { UserLean, UsersService } from '../users/users.service';
import type { AuthService } from './auth.service';
import { TelegramAuthService } from './telegram-auth.service';

const BOT_TOKEN = `123456:${randomBytes(18).toString('hex').slice(0, 35)}`;

function sign(fields: Omit<TelegramLoginInput, 'hash'>): string {
  const dataCheckString = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
  const secretKey = createHash('sha256').update(BOT_TOKEN).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

function validInput(
  overrides: Partial<Omit<TelegramLoginInput, 'hash'>> = {},
): TelegramLoginInput {
  const fields: Omit<TelegramLoginInput, 'hash'> = {
    id: 42,
    first_name: 'Дима',
    last_name: 'Учитель',
    auth_date: Math.floor(DateTime.utc().toSeconds()),
    ...overrides,
  };
  return { ...fields, hash: sign(fields) };
}

function fakeConfig(values: Record<string, unknown>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function fakeAuthService(): AuthService {
  return {
    issueSession: () => ({ token: 't', cookie: 'session=tok' }),
  } as unknown as AuthService;
}

const BASE_USER: UserLean = {
  id: 'u1',
  name: 'Дима Учитель',
  telegramId: 42,
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

interface UsersFakeOptions {
  onTouch?: (id: string) => void;
}

function fakeUsers(options: UsersFakeOptions = {}): UsersService {
  return {
    touchLogin: (id: string) => {
      options.onTouch?.(id);
      return Promise.resolve();
    },
  } as unknown as UsersService;
}

function fakeLoginIdentity(
  resolve: (
    telegramId: number,
    name: string,
    inviteCode: string | undefined,
  ) => Promise<UserLean> = () => Promise.resolve(BASE_USER),
): LoginIdentityService {
  return {
    resolveTelegramUser: (telegramId: number, name: string, inviteCode?: string) =>
      resolve(telegramId, name, inviteCode),
  } as unknown as LoginIdentityService;
}

interface BuildOptions {
  config?: ConfigService;
  users?: UsersService;
  loginIdentity?: LoginIdentityService;
}

function buildService(options: BuildOptions = {}): TelegramAuthService {
  return new TelegramAuthService(
    options.config ?? fakeConfig({ BOT_TOKEN }),
    options.users ?? fakeUsers(),
    fakeAuthService(),
    options.loginIdentity ?? fakeLoginIdentity(),
  );
}

describe('TelegramAuthService.login', () => {
  it('нет BOT_TOKEN — NotAvailableError, пользователей не трогает', async () => {
    let touched = false;
    const service = buildService({
      config: fakeConfig({}),
      users: fakeUsers({ onTouch: () => (touched = true) }),
    });

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(touched).toBe(false);
  });

  it('битая подпись — UnauthorizedError', async () => {
    const service = buildService();
    const tampered = { ...validInput(), hash: 'a'.repeat(64) };

    await expect(
      service.login(tampered, { ...tampered }, DateTime.utc()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('верная подпись — зовёт LoginIdentityService.resolveTelegramUser с id/именем/кодом, touchLogin, cookie', async () => {
    let touchedId: string | undefined;
    let received:
      { telegramId: number; name: string; inviteCode: string | undefined } | undefined;
    const service = buildService({
      users: fakeUsers({ onTouch: (id) => (touchedId = id) }),
      loginIdentity: fakeLoginIdentity((telegramId, name, inviteCode) => {
        received = { telegramId, name, inviteCode };
        return Promise.resolve(BASE_USER);
      }),
    });

    const input = validInput({ id: 42, first_name: 'Дима', last_name: 'Учитель' });
    const result = await service.login(
      input,
      { ...input },
      DateTime.utc(),
      'a'.repeat(32),
    );

    expect(received).toEqual({
      telegramId: 42,
      name: 'Дима Учитель',
      inviteCode: 'a'.repeat(32),
    });
    expect(touchedId).toBe(BASE_USER.id);
    expect(result.cookie).toBe('session=tok');
  });

  it('без inviteCode — тоже зовёт resolveTelegramUser, просто с undefined', async () => {
    let receivedCode: string | undefined = 'не вызывался';
    const service = buildService({
      loginIdentity: fakeLoginIdentity((_id, _name, inviteCode) => {
        receivedCode = inviteCode;
        return Promise.resolve(BASE_USER);
      }),
    });

    const input = validInput();
    await service.login(input, { ...input }, DateTime.utc());

    expect(receivedCode).toBeUndefined();
  });

  it('LoginIdentityService бросил ForbiddenError (нет ссылки-приглашения) — пробрасывается, cookie не выдаётся', async () => {
    const service = buildService({
      loginIdentity: fakeLoginIdentity(() =>
        Promise.reject(new ForbiddenError('нужна ссылка-приглашение')),
      ),
    });

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('blocked — ForbiddenError, touchLogin не вызывается', async () => {
    let touched = false;
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    const service = buildService({
      users: fakeUsers({ onTouch: () => (touched = true) }),
      loginIdentity: fakeLoginIdentity(() => Promise.resolve(blocked)),
    });

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(touched).toBe(false);
  });
});
