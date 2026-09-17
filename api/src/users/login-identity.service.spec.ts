// Юнит-тест единой точки «найти или завести человека при входе»
// (ADR-0030/0035) — фейки ConfigService/UsersService/EmailLoginUserService/
// InviteLinkService, без Mongo (CLAUDE.md «Тесты»).
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { ForbiddenError } from '../common/errors';
import type { EmailLoginUserService } from './email-login-user.service';
import type { InviteLinkService } from './invite-link.service';
import { LoginIdentityService } from './login-identity.service';
import type { NewTelegramUser, UserLean, UsersService } from './users.service';

const NOW = DateTime.fromISO('2026-09-15T10:00:00Z');
const BOOTSTRAP_ID = 900_000_001;
const VALID_CODE = 'a'.repeat(32);

const EXISTING: UserLean = {
  id: 'u1',
  name: 'Дима',
  telegramId: 42,
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function fakeConfig(values: Record<string, unknown> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

interface UsersOptions {
  existing?: UserLean | null;
  onCreate?: (input: NewTelegramUser) => void;
  created?: UserLean;
  onMarkJoined?: (id: string) => void;
}

function fakeUsers(options: UsersOptions = {}): UsersService {
  return {
    findByTelegramId: () => Promise.resolve(options.existing ?? null),
    createFromTelegram: (input: NewTelegramUser) => {
      options.onCreate?.(input);
      return Promise.resolve(options.created ?? { ...EXISTING, id: 'new1', roles: [] });
    },
    markJoinedViaInvite: (id: string) => {
      options.onMarkJoined?.(id);
      return Promise.resolve();
    },
  } as unknown as UsersService;
}

interface EmailUsersOptions {
  existing?: UserLean | null;
  onCreate?: (email: string) => void;
  created?: UserLean;
}

function fakeEmailUsers(options: EmailUsersOptions = {}): EmailLoginUserService {
  return {
    findByEmail: () => Promise.resolve(options.existing ?? null),
    createFromEmail: (email: string) => {
      options.onCreate?.(email);
      return Promise.resolve(
        options.created ?? { ...EXISTING, id: 'new-email', email, roles: [] },
      );
    },
  } as unknown as EmailLoginUserService;
}

function fakeInviteLink(isValid: (code: string) => Promise<boolean>): InviteLinkService {
  return { isValid } as unknown as InviteLinkService;
}

function build(options: {
  config?: ConfigService;
  users?: UsersService;
  emailUsers?: EmailLoginUserService;
  inviteLink?: InviteLinkService;
}): LoginIdentityService {
  return new LoginIdentityService(
    options.config ?? fakeConfig(),
    options.users ?? fakeUsers(),
    options.emailUsers ?? fakeEmailUsers(),
    options.inviteLink ?? fakeInviteLink(() => Promise.resolve(false)),
  );
}

describe('LoginIdentityService.resolveTelegramUser', () => {
  it('существующий пользователь — возвращается как есть, код игнорируется', async () => {
    const isValid = jest.fn();
    const service = build({
      users: fakeUsers({ existing: EXISTING }),
      inviteLink: fakeInviteLink(isValid),
    });

    const result = await service.resolveTelegramUser(42, 'Дима', undefined, NOW);

    expect(result).toEqual(EXISTING);
    expect(isValid).not.toHaveBeenCalled();
  });

  it('BOOTSTRAP_ADMIN_TELEGRAM_ID, новый — active, роли admin+teacher, без кода', async () => {
    let created: NewTelegramUser | undefined;
    const service = build({
      config: fakeConfig({ BOOTSTRAP_ADMIN_TELEGRAM_ID: BOOTSTRAP_ID }),
      users: fakeUsers({ existing: null, onCreate: (input) => (created = input) }),
    });

    await service.resolveTelegramUser(BOOTSTRAP_ID, 'Первый админ', undefined, NOW);

    expect(created).toEqual({
      telegramId: BOOTSTRAP_ID,
      name: 'Первый админ',
      roles: ['admin', 'teacher'],
      status: 'active',
    });
  });

  it('новый без кода — ForbiddenError, аккаунт не создаётся', async () => {
    const onCreate = jest.fn();
    const service = build({ users: fakeUsers({ existing: null, onCreate }) });

    await expect(
      service.resolveTelegramUser(777, 'Незнакомец', undefined, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('новый с невалидным кодом — ForbiddenError, аккаунт не создаётся', async () => {
    const onCreate = jest.fn();
    const service = build({
      users: fakeUsers({ existing: null, onCreate }),
      inviteLink: fakeInviteLink(() => Promise.resolve(false)),
    });

    await expect(
      service.resolveTelegramUser(777, 'Незнакомец', VALID_CODE, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('новый с валидным кодом — active без ролей, markJoinedViaInvite вызван', async () => {
    let created: NewTelegramUser | undefined;
    let markedId: string | undefined;
    const service = build({
      users: fakeUsers({
        existing: null,
        onCreate: (input) => (created = input),
        created: { ...EXISTING, id: 'new1', roles: [] },
        onMarkJoined: (id) => (markedId = id),
      }),
      inviteLink: fakeInviteLink((code) => Promise.resolve(code === VALID_CODE)),
    });

    const result = await service.resolveTelegramUser(777, 'Аня', VALID_CODE, NOW);

    expect(created).toEqual({
      telegramId: 777,
      name: 'Аня',
      roles: [],
      status: 'active',
    });
    expect(markedId).toBe('new1');
    expect(result.joinedViaInviteAt).toEqual(NOW.toJSDate());
  });
});

describe('LoginIdentityService.resolveEmailUser', () => {
  it('существующий email — возвращается как есть, код игнорируется', async () => {
    const isValid = jest.fn();
    const service = build({
      emailUsers: fakeEmailUsers({ existing: EXISTING }),
      inviteLink: fakeInviteLink(isValid),
    });

    const result = await service.resolveEmailUser('dima@example.com', undefined, NOW);

    expect(result).toEqual(EXISTING);
    expect(isValid).not.toHaveBeenCalled();
  });

  it('новый email без кода — ForbiddenError, аккаунт не создаётся', async () => {
    const onCreate = jest.fn();
    const service = build({ emailUsers: fakeEmailUsers({ existing: null, onCreate }) });

    await expect(
      service.resolveEmailUser('new@example.com', undefined, NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('новый email с валидным кодом — создаётся, markJoinedViaInvite вызван', async () => {
    let createdEmail: string | undefined;
    let markedId: string | undefined;
    const service = build({
      users: fakeUsers({ onMarkJoined: (id) => (markedId = id) }),
      emailUsers: fakeEmailUsers({
        existing: null,
        onCreate: (email) => (createdEmail = email),
        created: { ...EXISTING, id: 'new-email', email: 'new@example.com', roles: [] },
      }),
      inviteLink: fakeInviteLink((code) => Promise.resolve(code === VALID_CODE)),
    });

    const result = await service.resolveEmailUser('new@example.com', VALID_CODE, NOW);

    expect(createdEmail).toBe('new@example.com');
    expect(markedId).toBe('new-email');
    expect(result.joinedViaInviteAt).toEqual(NOW.toJSDate());
  });
});
