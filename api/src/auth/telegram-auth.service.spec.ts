// Юнит-тест сервиса входа через Telegram — фейки ConfigService/UsersService/
// AuthService, без Mongo и без HTTP (CLAUDE.md «Тесты»). Подпись — тем же
// алгоритмом, что и telegram-login.spec.ts (дубль допустим — файл со
// спеками, jscpd их не считает).
import { createHash, createHmac, randomBytes } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { TelegramLoginInput, UserRole } from '@xuanxue/shared';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import type { UserLean, UsersService } from '../users/users.service';
import type { AuthService } from './auth.service';
import { TelegramAuthService } from './telegram-auth.service';

const BOT_TOKEN = `123456:${randomBytes(18).toString('hex').slice(0, 35)}`;
const BOOTSTRAP_ID = 900_000_001;

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

interface UsersFakeOptions {
  existing?: UserLean | null;
  created?: UserLean;
  onCreate?: (input: { telegramId: number; name: string; roles: UserRole[] }) => void;
  onTouch?: (id: string) => void;
}

const BASE_USER: UserLean = {
  id: 'u1',
  name: 'Дима Учитель',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function fakeUsers(options: UsersFakeOptions): UsersService {
  return {
    findByTelegramId: () => Promise.resolve(options.existing ?? null),
    createFromTelegram: (input: {
      telegramId: number;
      name: string;
      roles: UserRole[];
    }) => {
      options.onCreate?.(input);
      return Promise.resolve(options.created ?? BASE_USER);
    },
    touchLogin: (id: string) => {
      options.onTouch?.(id);
      return Promise.resolve();
    },
  } as unknown as UsersService;
}

describe('TelegramAuthService.login', () => {
  it('нет BOT_TOKEN — NotAvailableError, пользователей не трогает', async () => {
    let touched = false;
    const service = new TelegramAuthService(
      fakeConfig({}),
      fakeUsers({ onTouch: () => (touched = true) }),
      fakeAuthService(),
    );

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(touched).toBe(false);
  });

  it('битая подпись — UnauthorizedError', async () => {
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN }),
      fakeUsers({}),
      fakeAuthService(),
    );
    const tampered = { ...validInput(), hash: 'a'.repeat(64) };

    await expect(
      service.login(tampered, { ...tampered }, DateTime.utc()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('новый пользователь с BOOTSTRAP_ADMIN_TELEGRAM_ID — роли admin+teacher', async () => {
    let createdRoles: UserRole[] | undefined;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      fakeUsers({ existing: null, onCreate: (input) => (createdRoles = input.roles) }),
      fakeAuthService(),
    );

    const input = validInput({ id: BOOTSTRAP_ID });
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(createdRoles).toEqual(['admin', 'teacher']);
    expect(result.cookie).toBe('session=tok');
  });

  it('новый пользователь без совпадения с bootstrap id — роли []', async () => {
    let createdRoles: UserRole[] | undefined;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      fakeUsers({ existing: null, onCreate: (input) => (createdRoles = input.roles) }),
      fakeAuthService(),
    );

    const input = validInput({ id: 1 });
    await service.login(input, { ...input }, DateTime.utc());

    expect(createdRoles).toEqual([]);
  });

  it('существующий пользователь — touchLogin, без createFromTelegram', async () => {
    let touchedId: string | undefined;
    let created = false;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN }),
      fakeUsers({
        existing: BASE_USER,
        onCreate: () => (created = true),
        onTouch: (id) => (touchedId = id),
      }),
      fakeAuthService(),
    );

    const input = validInput();
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(created).toBe(false);
    expect(touchedId).toBe(BASE_USER.id);
    expect(result.user).toEqual(BASE_USER);
  });

  // Регресс на гонку первых входов (createFromTelegram теперь атомарный
  // upsert): существующий пользователь с telegramId бутстрап-админа не
  // должен ни разу дойти до createFromTelegram — иначе первый апсерт снова
  // получил бы шанс переписать роли, которые администратор уже поменял в
  // интерфейсе.
  it('существующий пользователь с bootstrap id и roles [] — createFromTelegram не вызывается', async () => {
    let created = false;
    const existingWithBootstrapId: UserLean = {
      ...BASE_USER,
      telegramId: BOOTSTRAP_ID,
      roles: [],
    };
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      fakeUsers({
        existing: existingWithBootstrapId,
        onCreate: () => (created = true),
      }),
      fakeAuthService(),
    );

    const input = validInput({ id: BOOTSTRAP_ID });
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(created).toBe(false);
    expect(result.user.roles).toEqual([]);
  });

  it('заблокированный пользователь — ForbiddenError', async () => {
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN }),
      fakeUsers({ existing: blocked }),
      fakeAuthService(),
    );

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
