// Юнит-тест сервиса привязки почты — фейки ConfigService/EmailLinkTokenService/
// UserEmailService/UsersService/MailService, без Mongo и без сети (CLAUDE.md
// «Тесты»). Гонка/TTL/одноразовость токена — уже в
// email-link-token.service.spec.ts (mongodb-memory-server), исходы
// confirmEmail — в user-email.service.spec.ts, здесь — только склейка сервиса.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  EMAIL_CONFIRM_EXPIRED_MESSAGE,
  EMAIL_LINK_OTHER_EMAIL_MESSAGE,
  EMAIL_LINK_TAKEN_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import {
  ConflictError,
  ForbiddenError,
  NotAvailableError,
  UnauthorizedError,
} from '../common/errors';
import type { MailService } from '../mail/mail.service';
import type {
  EmailLinkTokenOwner,
  EmailLinkTokenService,
} from '../users/email-link-token.service';
import type { UserEmailService } from '../users/user-email.service';
import type { UserLean, UsersService } from '../users/users.service';
import { EmailLinkService } from './email-link.service';

const NOW = DateTime.fromISO('2026-09-18T10:00:00.000Z', { zone: 'utc' });

const AVAILABLE_CONFIG = {
  RESEND_API_KEY: 're_test',
  MAIL_FROM: 'Школа <school@xuanxue.su>',
  PUBLIC_URL: 'https://xuanxue.su',
};

const BASE_USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

/** Ловит отказ одним вызовом вместо `.rejects.toBeInstanceOf` +
 * `.rejects.toMatchObject` по отдельности — проверяем и класс ошибки (от
 * него зависит HTTP-статус, common/domain-exception.filter.ts), и текст. */
async function captureError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('ожидалась ошибка, промис выполнился успешно');
    },
    (err: unknown) => err,
  );
}

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function fakeTokens(
  issue: (userId: string, email: string) => Promise<string> = () =>
    Promise.resolve('t'.repeat(64)),
  consume: (token: string) => Promise<EmailLinkTokenOwner | null> = () =>
    Promise.reject(new Error('consume() не должен был вызываться в этом тесте')),
): EmailLinkTokenService {
  return { issue, consume } as unknown as EmailLinkTokenService;
}

function fakeUserEmailService(
  options: {
    isEmailTaken?: (email: string) => Promise<boolean>;
    setPendingEmail?: (userId: string, email: string) => Promise<void>;
    confirmEmail?: (userId: string, email: string) => Promise<'ok' | 'taken' | 'stale'>;
  } = {},
): UserEmailService {
  return {
    isEmailTaken: options.isEmailTaken ?? (() => Promise.resolve(false)),
    setPendingEmail: options.setPendingEmail ?? (() => Promise.resolve()),
    confirmEmail:
      options.confirmEmail ??
      (() => Promise.reject(new Error('confirmEmail() не должен был вызываться'))),
  } as unknown as UserEmailService;
}

function fakeUsersService(
  findById: (id: string) => Promise<UserLean | null> = () => Promise.resolve(BASE_USER),
): UsersService {
  return { findById } as unknown as UsersService;
}

function fakeMail(
  send: (input: { to: string; link: string }) => Promise<void> = () => Promise.resolve(),
): MailService {
  return { sendEmailConfirmLink: send } as unknown as MailService;
}

interface BuildOptions {
  config?: ConfigService;
  tokens?: EmailLinkTokenService;
  userEmailService?: UserEmailService;
  users?: UsersService;
  mail?: MailService;
}

function buildService(options: BuildOptions = {}): EmailLinkService {
  return new EmailLinkService(
    options.config ?? fakeConfig(AVAILABLE_CONFIG),
    options.tokens ?? fakeTokens(),
    options.userEmailService ?? fakeUserEmailService(),
    options.users ?? fakeUsersService(),
    options.mail ?? fakeMail(),
  );
}

describe('EmailLinkService.link', () => {
  it.each(['RESEND_API_KEY', 'MAIL_FROM', 'PUBLIC_URL'])(
    'нет %s — NotAvailableError, ничего не пишем и не шлём',
    async (missingKey) => {
      let touched = false;
      const service = buildService({
        config: fakeConfig({ ...AVAILABLE_CONFIG, [missingKey]: undefined }),
        userEmailService: fakeUserEmailService({
          setPendingEmail: () => {
            touched = true;
            return Promise.resolve();
          },
        }),
      });

      const err = await captureError(service.link(BASE_USER, 'a@example.com', NOW));

      expect(err).toBeInstanceOf(NotAvailableError);
      expect((err as Error).message).toBe(EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE);
      expect(touched).toBe(false);
    },
  );

  it('email уже равен текущему (в любом регистре) — тихо выходим, идемпотентно', async () => {
    let touched = false;
    const service = buildService({
      userEmailService: fakeUserEmailService({
        setPendingEmail: () => {
          touched = true;
          return Promise.resolve();
        },
      }),
    });
    const user: UserLean = { ...BASE_USER, email: 'maria@example.com' };

    await expect(service.link(user, 'Maria@Example.com', NOW)).resolves.toBeUndefined();
    expect(touched).toBe(false);
  });

  it('у аккаунта уже есть ДРУГАЯ подтверждённая почта — ConflictError', async () => {
    const service = buildService();
    const user: UserLean = { ...BASE_USER, email: 'old@example.com' };

    const err = await captureError(service.link(user, 'new@example.com', NOW));

    expect(err).toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe(EMAIL_LINK_OTHER_EMAIL_MESSAGE);
  });

  it('адрес уже занят другим аккаунтом — ConflictError, pendingEmail не пишем', async () => {
    let touched = false;
    const service = buildService({
      userEmailService: fakeUserEmailService({
        isEmailTaken: () => Promise.resolve(true),
        setPendingEmail: () => {
          touched = true;
          return Promise.resolve();
        },
      }),
    });

    const err = await captureError(service.link(BASE_USER, 'taken@example.com', NOW));

    expect(err).toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe(EMAIL_LINK_TAKEN_MESSAGE);
    expect(touched).toBe(false);
  });

  it('успех — нормализует email в lowercase, пишет pendingEmail ДО отправки письма, ссылка на /email/confirm', async () => {
    const calls: string[] = [];
    let sentTo: string | undefined;
    let sentLink: string | undefined;
    const service = buildService({
      userEmailService: fakeUserEmailService({
        setPendingEmail: () => {
          calls.push('setPendingEmail');
          return Promise.resolve();
        },
      }),
      tokens: fakeTokens((userId, email) => {
        calls.push('issue');
        expect(userId).toBe(BASE_USER.id);
        expect(email).toBe('student@example.com');
        return Promise.resolve('a'.repeat(64));
      }),
      mail: fakeMail((input) => {
        calls.push('sendEmailConfirmLink');
        sentTo = input.to;
        sentLink = input.link;
        return Promise.resolve();
      }),
    });

    await service.link(BASE_USER, 'Student@Example.com', NOW);

    expect(calls).toEqual(['setPendingEmail', 'issue', 'sendEmailConfirmLink']);
    expect(sentTo).toBe('student@example.com');
    expect(sentLink).toBe(`https://xuanxue.su/email/confirm?token=${'a'.repeat(64)}`);
  });
});

describe('EmailLinkService.confirm', () => {
  it('токен неизвестен/протух/использован — UnauthorizedError', async () => {
    const service = buildService({
      tokens: fakeTokens(undefined, () => Promise.resolve(null)),
    });

    const err = await captureError(service.confirm('x'.repeat(64), NOW));

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).toBe(EMAIL_CONFIRM_EXPIRED_MESSAGE);
  });

  it('аккаунта из токена больше нет — тот же UnauthorizedError', async () => {
    const service = buildService({
      tokens: fakeTokens(undefined, () =>
        Promise.resolve({ userId: 'gone', email: 'a@example.com' }),
      ),
      users: fakeUsersService(() => Promise.resolve(null)),
    });

    const err = await captureError(service.confirm('x'.repeat(64), NOW));

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).toBe(EMAIL_CONFIRM_EXPIRED_MESSAGE);
  });

  it('аккаунт заблокирован — ForbiddenError, email не пишем', async () => {
    let touched = false;
    const blocked: UserLean = { ...BASE_USER, status: 'blocked' };
    const service = buildService({
      tokens: fakeTokens(undefined, () =>
        Promise.resolve({ userId: blocked.id, email: 'a@example.com' }),
      ),
      users: fakeUsersService(() => Promise.resolve(blocked)),
      userEmailService: fakeUserEmailService({
        confirmEmail: () => {
          touched = true;
          return Promise.resolve('ok');
        },
      }),
    });

    const err = await captureError(service.confirm('x'.repeat(64), NOW));

    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as Error).message).toBe(ACCESS_MESSAGE);
    expect(touched).toBe(false);
  });

  it("confirmEmail вернул 'taken' — ConflictError", async () => {
    const service = buildService({
      tokens: fakeTokens(undefined, () =>
        Promise.resolve({ userId: BASE_USER.id, email: 'a@example.com' }),
      ),
      userEmailService: fakeUserEmailService({
        confirmEmail: () => Promise.resolve('taken'),
      }),
    });

    const err = await captureError(service.confirm('x'.repeat(64), NOW));

    expect(err).toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe(EMAIL_LINK_TAKEN_MESSAGE);
  });

  it("confirmEmail вернул 'stale' — UnauthorizedError", async () => {
    const service = buildService({
      tokens: fakeTokens(undefined, () =>
        Promise.resolve({ userId: BASE_USER.id, email: 'a@example.com' }),
      ),
      userEmailService: fakeUserEmailService({
        confirmEmail: () => Promise.resolve('stale'),
      }),
    });

    const err = await captureError(service.confirm('x'.repeat(64), NOW));

    expect(err).toBeInstanceOf(UnauthorizedError);
    expect((err as Error).message).toBe(EMAIL_CONFIRM_EXPIRED_MESSAGE);
  });

  it("confirmEmail вернул 'ok' — успех, без возврата значения", async () => {
    const service = buildService({
      tokens: fakeTokens(undefined, () =>
        Promise.resolve({ userId: BASE_USER.id, email: 'a@example.com' }),
      ),
      userEmailService: fakeUserEmailService({
        confirmEmail: () => Promise.resolve('ok'),
      }),
    });

    await expect(service.confirm('x'.repeat(64), NOW)).resolves.toBeUndefined();
  });
});
