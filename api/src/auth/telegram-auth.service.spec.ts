// Юнит-тест сервиса входа через Telegram — фейки ConfigService/UsersService/
// AuthService, без Mongo и без HTTP (CLAUDE.md «Тесты»). Подпись — тем же
// алгоритмом, что и telegram-login.spec.ts (дубль допустим — файл со
// спеками, jscpd их не считает).
import { createHash, createHmac, randomBytes } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { TelegramLoginInput, UserRole, UserStatus } from '@xuanxue/shared';
import type { GroupMembershipService } from '../channels/group-membership.service';
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

// По умолчанию — не участник ни одной группы: большинство тестов проверяют
// ветку invited и не должны зависеть от членства.
function fakeGroupMembership(isMember = false): GroupMembershipService {
  return {
    isMemberOfSchoolGroup: () => Promise.resolve(isMember),
  } as unknown as GroupMembershipService;
}

interface NewUserInput {
  telegramId: number;
  name: string;
  roles: UserRole[];
  status: UserStatus;
}

interface UsersFakeOptions {
  existing?: UserLean | null;
  created?: UserLean;
  onCreate?: (input: NewUserInput) => void;
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
    createFromTelegram: (input: NewUserInput) => {
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
      fakeGroupMembership(),
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
      fakeGroupMembership(),
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
      fakeGroupMembership(),
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
      fakeGroupMembership(),
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
      fakeGroupMembership(),
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
      fakeGroupMembership(),
    );

    const input = validInput({ id: BOOTSTRAP_ID });
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(created).toBe(false);
    expect(result.user.roles).toEqual([]);
  });

  // ADR-0026: подтверждать первого админа некому — он входит сразу.
  it('новый пользователь с BOOTSTRAP_ADMIN_TELEGRAM_ID — статус active', async () => {
    let createdStatus: UserStatus | undefined;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      fakeUsers({ existing: null, onCreate: (input) => (createdStatus = input.status) }),
      fakeAuthService(),
      fakeGroupMembership(),
    );

    const input = validInput({ id: BOOTSTRAP_ID });
    await service.login(input, { ...input }, DateTime.utc());

    expect(createdStatus).toBe('active');
  });

  it('новый вход, не состоит в группе учеников — статус invited, ждёт подтверждения школы', async () => {
    let created: NewUserInput | undefined;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      fakeUsers({ existing: null, onCreate: (input) => (created = input) }),
      fakeAuthService(),
      fakeGroupMembership(false),
    );

    const input = validInput({ id: 777 });
    await service.login(input, { ...input }, DateTime.utc());

    expect(created?.status).toBe('invited');
    expect(created?.roles).toEqual([]);
  });

  // ADR-0026, владелец 2026-09-12: «если человек участник группы, то можно» —
  // подтверждение не должно ложиться на ученика (CLAUDE.md «Ноль нагрузки на
  // ученика»).
  it('новый вход, уже состоит в группе учеников — статус active сразу, без ручного подтверждения', async () => {
    let created: NewUserInput | undefined;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      fakeUsers({ existing: null, onCreate: (input) => (created = input) }),
      fakeAuthService(),
      fakeGroupMembership(true),
    );

    const input = validInput({ id: 777 });
    await service.login(input, { ...input }, DateTime.utc());

    expect(created?.status).toBe('active');
    expect(created?.roles).toEqual([]);
  });

  it('существующий пользователь — членство в группе не проверяется (статус не трогаем)', async () => {
    let checked = false;
    const groupMembership: GroupMembershipService = {
      isMemberOfSchoolGroup: () => {
        checked = true;
        return Promise.resolve(true);
      },
    } as unknown as GroupMembershipService;
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN }),
      fakeUsers({ existing: BASE_USER }),
      fakeAuthService(),
      groupMembership,
    );

    const input = validInput();
    await service.login(input, { ...input }, DateTime.utc());

    expect(checked).toBe(false);
  });

  it('заблокированный пользователь — ForbiddenError', async () => {
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    const service = new TelegramAuthService(
      fakeConfig({ BOT_TOKEN }),
      fakeUsers({ existing: blocked }),
      fakeAuthService(),
      fakeGroupMembership(),
    );

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
