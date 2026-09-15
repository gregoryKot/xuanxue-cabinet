// Юнит-тест сервиса входа по email — фейки ConfigService/EmailLoginTokenService/
// MailService/EmailLoginUserService/UsersService/AuthService, без Mongo и без
// сети (CLAUDE.md «Тесты»). Гонка/TTL/одноразовость токена — уже в
// email-login-token.service.spec.ts (mongodb-memory-server), здесь — только
// склейка сервиса.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import type { EmailLoginUserService } from '../users/email-login-user.service';
import type { InviteLinkService } from '../users/invite-link.service';
import type { UserLean, UsersService } from '../users/users.service';
import type { MailService } from '../mail/mail.service';
import type { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import type { EmailLoginTokenService } from './email-login-token.service';

const NOW = DateTime.fromISO('2026-09-15T10:00:00.000Z', { zone: 'utc' });

const AVAILABLE_CONFIG = {
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'Школа <school@xuanxue.su>',
  PUBLIC_URL: 'https://xuanxue.su',
};

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function fakeTokens(
  issue: (email: string) => Promise<string | null> = () =>
    Promise.resolve('t'.repeat(64)),
  consume: (token: string) => Promise<string | null> = () =>
    Promise.reject(new Error('consume() не должен был вызываться в этом тесте')),
): EmailLoginTokenService {
  return { issue, consume } as unknown as EmailLoginTokenService;
}

function fakeMail(
  send: (input: { to: string; link: string }) => Promise<void> = () => Promise.resolve(),
): MailService {
  return { sendLoginLink: send } as unknown as MailService;
}

const BASE_USER: UserLean = {
  id: 'u1',
  name: 'ученик@example.com',
  email: 'ученик@example.com',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'invited',
};

interface EmailUsersOptions {
  existing?: UserLean | null;
  created?: UserLean;
  onCreate?: (email: string) => void;
}

function fakeEmailUsers(options: EmailUsersOptions): EmailLoginUserService {
  return {
    findByEmail: () => Promise.resolve(options.existing ?? null),
    createFromEmail: (email: string) => {
      options.onCreate?.(email);
      return Promise.resolve(options.created ?? BASE_USER);
    },
  } as unknown as EmailLoginUserService;
}

function fakeUsersService(onTouch?: (id: string) => void): UsersService {
  return {
    touchLogin: (id: string) => {
      onTouch?.(id);
      return Promise.resolve();
    },
  } as unknown as UsersService;
}

function fakeAuthService(): AuthService {
  return {
    issueSession: () => ({ token: 't', cookie: 'session=tok' }),
  } as unknown as AuthService;
}

function fakeInviteLink(
  isValid: (code: string) => Promise<boolean> = () => Promise.resolve(false),
): InviteLinkService {
  return { isValid } as unknown as InviteLinkService;
}

interface BuildOptions {
  config?: ConfigService;
  tokens?: EmailLoginTokenService;
  mail?: MailService;
  emailUsers?: EmailLoginUserService;
  users?: UsersService;
  inviteLink?: InviteLinkService;
}

function buildService(options: BuildOptions = {}): EmailAuthService {
  return new EmailAuthService(
    options.config ?? fakeConfig(AVAILABLE_CONFIG),
    options.tokens ?? fakeTokens(),
    options.mail ?? fakeMail(),
    options.emailUsers ?? fakeEmailUsers({}),
    options.users ?? fakeUsersService(),
    fakeAuthService(),
    options.inviteLink ?? fakeInviteLink(),
  );
}

describe('EmailAuthService.isEnabled', () => {
  it('все три переменные заданы — true', () => {
    const service = buildService({ config: fakeConfig(AVAILABLE_CONFIG) });
    expect(service.isEnabled()).toBe(true);
  });

  it.each(['RESEND_API_KEY', 'MAIL_FROM', 'PUBLIC_URL'])(
    'нет %s — false',
    (missingKey) => {
      const service = buildService({
        config: fakeConfig({ ...AVAILABLE_CONFIG, [missingKey]: undefined }),
      });
      expect(service.isEnabled()).toBe(false);
    },
  );
});

describe('EmailAuthService.requestLink', () => {
  it.each(['RESEND_API_KEY', 'MAIL_FROM', 'PUBLIC_URL'])(
    'нет %s — NotAvailableError, токен не выпускается',
    async (missingKey) => {
      let issued = false;
      const config = fakeConfig({ ...AVAILABLE_CONFIG, [missingKey]: undefined });
      const service = buildService({
        config,
        tokens: fakeTokens(() => {
          issued = true;
          return Promise.resolve('t'.repeat(64));
        }),
      });

      await expect(service.requestLink('a@example.com', NOW)).rejects.toBeInstanceOf(
        NotAvailableError,
      );
      expect(issued).toBe(false);
    },
  );

  it('доступно — нормализует email в lowercase, шлёт ссылку с токеном', async () => {
    let issuedFor: string | undefined;
    let sentTo: string | undefined;
    let sentLink: string | undefined;
    const service = buildService({
      tokens: fakeTokens((email) => {
        issuedFor = email;
        return Promise.resolve('a'.repeat(64));
      }),
      mail: fakeMail((input) => {
        sentTo = input.to;
        sentLink = input.link;
        return Promise.resolve();
      }),
    });

    await service.requestLink('Ученик@Example.com', NOW);

    expect(issuedFor).toBe('ученик@example.com');
    expect(sentTo).toBe('ученик@example.com');
    expect(sentLink).toBe(`https://xuanxue.su/login/email?token=${'a'.repeat(64)}`);
  });

  it('валидный inviteCode — ссылка содержит join=<code> (ADR-0030)', async () => {
    let sentLink: string | undefined;
    const code = 'b'.repeat(32);
    const service = buildService({
      tokens: fakeTokens(() => Promise.resolve('a'.repeat(64))),
      mail: fakeMail((input) => {
        sentLink = input.link;
        return Promise.resolve();
      }),
      inviteLink: fakeInviteLink((c) => Promise.resolve(c === code)),
    });

    await service.requestLink('a@example.com', NOW, code);

    expect(sentLink).toBe(
      `https://xuanxue.su/login/email?token=${'a'.repeat(64)}&join=${code}`,
    );
  });

  it('невалидный inviteCode — молча игнорируется, ссылка без join=', async () => {
    let sentLink: string | undefined;
    const service = buildService({
      tokens: fakeTokens(() => Promise.resolve('a'.repeat(64))),
      mail: fakeMail((input) => {
        sentLink = input.link;
        return Promise.resolve();
      }),
      inviteLink: fakeInviteLink(() => Promise.resolve(false)),
    });

    await service.requestLink('a@example.com', NOW, 'c'.repeat(32));

    expect(sentLink).toBe(`https://xuanxue.su/login/email?token=${'a'.repeat(64)}`);
  });

  it('cooldown — issue() вернул null, письмо не шлём, ошибки нет', async () => {
    let sent = false;
    const service = buildService({
      tokens: fakeTokens(() => Promise.resolve(null)),
      mail: fakeMail(() => {
        sent = true;
        return Promise.resolve();
      }),
    });

    await expect(service.requestLink('a@example.com', NOW)).resolves.toBeUndefined();
    expect(sent).toBe(false);
  });
});

describe('EmailAuthService.verify', () => {
  it('неизвестный/протухший/использованный токен — UnauthorizedError', async () => {
    const service = buildService({
      tokens: fakeTokens(undefined, () => Promise.resolve(null)),
    });

    await expect(service.verify('x'.repeat(64), NOW)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('email уже есть в базе — вход без создания нового пользователя', async () => {
    let created = false;
    let touchedId: string | undefined;
    const service = buildService({
      tokens: fakeTokens(undefined, () => Promise.resolve(BASE_USER.email as string)),
      emailUsers: fakeEmailUsers({
        existing: BASE_USER,
        onCreate: () => (created = true),
      }),
      users: fakeUsersService((id) => (touchedId = id)),
    });

    const result = await service.verify('x'.repeat(64), NOW);

    expect(created).toBe(false);
    expect(touchedId).toBe(BASE_USER.id);
    expect(result.user).toEqual(BASE_USER);
    expect(result.cookie).toBe('session=tok');
  });

  it('неизвестный email — createFromEmail, статус invited', async () => {
    let createdEmail: string | undefined;
    const service = buildService({
      tokens: fakeTokens(undefined, () => Promise.resolve('new@example.com')),
      emailUsers: fakeEmailUsers({
        existing: null,
        created: { ...BASE_USER, id: 'u2', email: 'new@example.com' },
        onCreate: (email) => (createdEmail = email),
      }),
    });

    const result = await service.verify('x'.repeat(64), NOW);

    expect(createdEmail).toBe('new@example.com');
    expect(result.user.status).toBe('invited');
  });

  it('заблокированный пользователь — ForbiddenError, сессия не выпускается', async () => {
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    let touched = false;
    const service = buildService({
      tokens: fakeTokens(undefined, () => Promise.resolve(blocked.email as string)),
      emailUsers: fakeEmailUsers({ existing: blocked }),
      users: fakeUsersService(() => (touched = true)),
    });

    await expect(service.verify('x'.repeat(64), NOW)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(touched).toBe(false);
  });
});
