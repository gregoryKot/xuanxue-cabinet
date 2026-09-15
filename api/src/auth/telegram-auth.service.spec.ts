// Юнит-тест сервиса входа через Telegram — фейки ConfigService/UsersService/
// AuthService, без Mongo и без HTTP (CLAUDE.md «Тесты»). Подпись — тем же
// алгоритмом, что и telegram-login.spec.ts (дубль допустим — файл со
// спеками, jscpd их не считает). StudentMembershipApprovalService — не
// фейк целиком, а настоящий класс на фейковых GroupMembershipService/
// UserRolesService: так тесты этого файла заодно проверяют реальную склейку
// «перепроверка при входе», не только то, что она была вызвана.
import { createHash, createHmac, randomBytes } from 'crypto';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { TelegramLoginInput, UserRole, UserStatus } from '@xuanxue/shared';
import type { GroupMembershipService } from '../channels/group-membership.service';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { StudentMembershipApprovalService } from '../users/student-membership-approval.service';
import type { UserRolesService } from '../users/user-roles.service';
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

function fakeUserRoles(approve: (id: string) => Promise<UserLean>): UserRolesService {
  return { approve } as unknown as UserRolesService;
}

// approve() по умолчанию падает: большинство тестов не задевают ветку
// «существующий invited, перепроверка по входу» (BASE_USER — active), и
// случайное обращение к approve() должно завалить тест, а не тихо
// проскочить на заглушке.
function fakeMembershipApproval(
  groupMembership: GroupMembershipService,
  approve: (id: string) => Promise<UserLean> = () =>
    Promise.reject(new Error('approve() не должен был вызываться в этом тесте')),
): StudentMembershipApprovalService {
  return new StudentMembershipApprovalService(groupMembership, fakeUserRoles(approve));
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
  telegramId: 42, // совпадает с id по умолчанию в validInput() — перепроверка
  // членства (StudentMembershipApprovalService) без telegramId не работает.
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

interface BuildOptions {
  config?: ConfigService;
  users?: UsersService;
  groupMembership?: GroupMembershipService;
  approve?: (id: string) => Promise<UserLean>;
}

/** Собирает TelegramAuthService с фейковыми зависимостями по умолчанию —
 * один источник для сборки во всех тестах ниже вместо повторения пяти
 * аргументов конструктора в каждом (CLAUDE.md «Дубли»). */
function buildService(options: BuildOptions = {}): TelegramAuthService {
  const groupMembership = options.groupMembership ?? fakeGroupMembership();
  return new TelegramAuthService(
    options.config ?? fakeConfig({ BOT_TOKEN }),
    options.users ?? fakeUsers({}),
    fakeAuthService(),
    groupMembership,
    fakeMembershipApproval(groupMembership, options.approve),
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

  it('новый пользователь с BOOTSTRAP_ADMIN_TELEGRAM_ID — роли admin+teacher', async () => {
    let createdRoles: UserRole[] | undefined;
    const service = buildService({
      config: fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({
        existing: null,
        onCreate: (input) => (createdRoles = input.roles),
      }),
    });

    const input = validInput({ id: BOOTSTRAP_ID });
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(createdRoles).toEqual(['admin', 'teacher']);
    expect(result.cookie).toBe('session=tok');
  });

  it('новый пользователь без совпадения с bootstrap id — роли []', async () => {
    let createdRoles: UserRole[] | undefined;
    const service = buildService({
      config: fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({
        existing: null,
        onCreate: (input) => (createdRoles = input.roles),
      }),
    });

    const input = validInput({ id: 1 });
    await service.login(input, { ...input }, DateTime.utc());

    expect(createdRoles).toEqual([]);
  });

  it('существующий пользователь active — touchLogin, без createFromTelegram, без перепроверки группы', async () => {
    let touchedId: string | undefined;
    let created = false;
    let checked = false;
    const groupMembership: GroupMembershipService = {
      isMemberOfSchoolGroup: () => {
        checked = true;
        return Promise.resolve(true);
      },
    } as unknown as GroupMembershipService;
    const service = buildService({
      users: fakeUsers({
        existing: BASE_USER,
        onCreate: () => (created = true),
        onTouch: (id) => (touchedId = id),
      }),
      groupMembership,
    });

    const input = validInput();
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(created).toBe(false);
    expect(touchedId).toBe(BASE_USER.id);
    expect(result.user).toEqual(BASE_USER);
    // Уже active — перепроверять членство незачем (StudentMembershipApprovalService
    // выходит раньше isMemberOfSchoolGroup для не-invited статуса).
    expect(checked).toBe(false);
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
    const service = buildService({
      config: fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({
        existing: existingWithBootstrapId,
        onCreate: () => (created = true),
      }),
    });

    const input = validInput({ id: BOOTSTRAP_ID });
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(created).toBe(false);
    expect(result.user.roles).toEqual([]);
  });

  // ADR-0026: подтверждать первого админа некому — он входит сразу.
  it('новый пользователь с BOOTSTRAP_ADMIN_TELEGRAM_ID — статус active', async () => {
    let createdStatus: UserStatus | undefined;
    const service = buildService({
      config: fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({
        existing: null,
        onCreate: (input) => (createdStatus = input.status),
      }),
    });

    const input = validInput({ id: BOOTSTRAP_ID });
    await service.login(input, { ...input }, DateTime.utc());

    expect(createdStatus).toBe('active');
  });

  it('новый вход, не состоит в группе учеников — статус invited, ждёт подтверждения школы', async () => {
    let created: NewUserInput | undefined;
    const service = buildService({
      config: fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({ existing: null, onCreate: (input) => (created = input) }),
      groupMembership: fakeGroupMembership(false),
    });

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
    const service = buildService({
      config: fakeConfig({ BOT_TOKEN, BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({ existing: null, onCreate: (input) => (created = input) }),
      groupMembership: fakeGroupMembership(true),
    });

    const input = validInput({ id: 777 });
    await service.login(input, { ...input }, DateTime.utc());

    expect(created?.status).toBe('active');
    expect(created?.roles).toEqual([]);
  });

  // Задача «Пересчёт при каждом входе» — человек уже открывал кабинет
  // (invited), его добавили в группу учеников ПОСЛЕ этого, следующий вход
  // подтверждает его тем же кодом, что первый (не второй раз статус
  // «invited навсегда»).
  it('существующий invited, теперь состоит в группе — при входе становится active', async () => {
    const invitedUser: UserLean = { ...BASE_USER, status: 'invited' };
    let approvedId: string | undefined;
    const service = buildService({
      users: fakeUsers({ existing: invitedUser }),
      groupMembership: fakeGroupMembership(true),
      approve: (id) => {
        approvedId = id;
        return Promise.resolve({ ...invitedUser, status: 'active' });
      },
    });

    const input = validInput();
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(approvedId).toBe(invitedUser.id);
    expect(result.user.status).toBe('active');
  });

  it('существующий invited, всё ещё не состоит в группе — остаётся invited', async () => {
    const invitedUser: UserLean = { ...BASE_USER, status: 'invited' };
    const service = buildService({
      users: fakeUsers({ existing: invitedUser }),
      groupMembership: fakeGroupMembership(false),
    });

    const input = validInput();
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(result.user.status).toBe('invited');
  });

  // Важный тест: членство в группе НЕ снимает блокировку — это осознанное
  // решение админа, а не побочный эффект автоподтверждения (SECURITY §9).
  // approve() у blocked не вызывается вовсе — StudentMembershipApprovalService
  // проверяет status === 'invited' раньше, чем зовёт groupMembership.
  it('заблокированный пользователь — состоит в группе учеников, но остаётся blocked (ForbiddenError)', async () => {
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    const service = buildService({
      users: fakeUsers({ existing: blocked }),
      groupMembership: fakeGroupMembership(true),
    });

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('заблокированный пользователь без группы — тоже ForbiddenError', async () => {
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    const service = buildService({ users: fakeUsers({ existing: blocked }) });

    const input = validInput();
    await expect(
      service.login(input, { ...input }, DateTime.utc()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  // Сбой Bot API при проверке членства не должен ронять вход: GroupMembershipService
  // сам ловит ошибку и отдаёт false (group-membership.service.spec.ts,
  // «ошибка Bot API — false, warn в лог, вход не падает») — здесь проверяем,
  // что перепроверка при входе честно принимает этот false и не подтверждает
  // никого, а не падает и не считает сбой за «участник».
  it('сбой проверки членства (Bot API недоступен) — вход не падает, invited не подтверждается', async () => {
    const invitedUser: UserLean = { ...BASE_USER, status: 'invited' };
    const service = buildService({
      users: fakeUsers({ existing: invitedUser }),
      groupMembership: fakeGroupMembership(false), // так GroupMembershipService и отвечает при сбое Bot API
    });

    const input = validInput();
    const result = await service.login(input, { ...input }, DateTime.utc());

    expect(result.user.status).toBe('invited');
  });
});
