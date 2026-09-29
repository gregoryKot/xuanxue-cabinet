// Test.createTestingModule с фейком сервиса — образец email-code.controller.spec.ts
// (тот же приём у email-link.controller.spec.ts). Главное, что проверяем:
// start() ставит Set-Cookie только для 'oauth' (у 'no-session' запоминать
// нечего — cookie не была выпущена), оба варианта кладут Location и 302;
// login() гасит google_oauth ДО обращения к сервису (SECURITY §2) и добавляет
// вторую cookie сессии только при входе, не при привязке (ADR-0059).
import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import type { RedirectResponseLike } from '../common/video-redirect';
import type { ResponseLike } from '../common/http-headers';
import type { UserLean } from '../users/users.service';
import { GoogleAuthController } from './google-auth.controller';
import type { GoogleAuthStartResult, GoogleLoginResult } from './google-auth.service';
import { GoogleAuthService } from './google-auth.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
};

const OAUTH_COOKIE = 'google_oauth=abc; HttpOnly; Path=/api/auth/google';
const SESSION_COOKIE = 'session=token; HttpOnly; Path=/';
const CLEAR_COOKIE =
  'google_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0';

function fakeRedirectResponse(): {
  res: RedirectResponseLike;
  headers: Record<string, string | string[]>;
  status: () => number | null;
} {
  const headers: Record<string, string | string[]> = {};
  let code: number | null = null;
  const res: RedirectResponseLike = {
    setHeader: (name: string, value: string | string[]) => {
      headers[name] = value;
    },
    status: (c: number) => {
      code = c;
    },
  };
  return { res, headers, status: () => code };
}

function fakeResponse(): {
  res: ResponseLike;
  headers: Record<string, string | string[]>;
} {
  const headers: Record<string, string | string[]> = {};
  const res: ResponseLike = {
    setHeader: (name: string, value: string | string[]) => {
      headers[name] = value;
      return undefined;
    },
  };
  return { res, headers };
}

async function buildController(overrides: {
  start?: () => Promise<GoogleAuthStartResult>;
  login?: () => Promise<GoogleLoginResult>;
}): Promise<GoogleAuthController> {
  const module = await Test.createTestingModule({
    controllers: [GoogleAuthController],
    providers: [
      {
        provide: GoogleAuthService,
        useValue: {
          start: overrides.start ?? (() => Promise.reject(new Error('unused'))),
          login: overrides.login ?? (() => Promise.reject(new Error('unused'))),
        },
      },
      {
        provide: PersonalChats,
        useValue: { hasActiveChatFor: () => Promise.resolve(false) },
      },
    ],
  }).compile();
  return module.get(GoogleAuthController);
}

describe('GoogleAuthController.start', () => {
  it("kind 'oauth' — cookie заявки, Location на Google, 302", async () => {
    const controller = await buildController({
      start: () =>
        Promise.resolve({
          kind: 'oauth',
          cookie: OAUTH_COOKIE,
          url: 'https://accounts.google.com/o/oauth2/v2/auth?state=…',
        }),
    });
    const { res, headers, status } = fakeRedirectResponse();

    await controller.start(undefined, undefined, { method: 'GET', headers: {} }, res);

    expect(headers['Set-Cookie']).toBe(OAUTH_COOKIE);
    expect(headers.Location).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=…');
    expect(status()).toBe(HttpStatus.FOUND);
  });

  it("kind 'no-session' — cookie не ставится, Location на /login, всё равно 302", async () => {
    const controller = await buildController({
      start: () =>
        Promise.resolve({ kind: 'no-session', url: 'https://xuanxue.su/login' }),
    });
    const { res, headers, status } = fakeRedirectResponse();

    await controller.start(undefined, undefined, { method: 'GET', headers: {} }, res);

    expect(headers['Set-Cookie']).toBeUndefined();
    expect(headers.Location).toBe('https://xuanxue.su/login');
    expect(status()).toBe(HttpStatus.FOUND);
  });
});

describe('GoogleAuthController.login', () => {
  it('результат входа — две Set-Cookie: очистка заявки и новая сессия', async () => {
    const controller = await buildController({
      login: () =>
        Promise.resolve<GoogleLoginResult>({ user: USER, cookie: SESSION_COOKIE }),
    });
    const { res, headers } = fakeResponse();

    const result = await controller.login(
      { code: 'x'.repeat(20), state: 'y'.repeat(43) },
      { method: 'POST', headers: {} },
      res,
    );

    expect(headers['Set-Cookie']).toEqual([CLEAR_COOKIE, SESSION_COOKIE]);
    expect(result).toEqual<MeDto>({
      id: USER.id,
      name: USER.name,
      roles: USER.roles,
      status: USER.status,
      telegramLinked: false,
      botChatActive: false,
      hasEmail: false,
      googleLinked: false,
      noTelegram: false,
      needsProfile: true,
    });
  });

  it('результат привязки — только очистка cookie, новой сессии нет', async () => {
    const controller = await buildController({
      login: () => Promise.resolve<GoogleLoginResult>({ user: USER }),
    });
    const { res, headers } = fakeResponse();

    await controller.login(
      { code: 'x'.repeat(20), state: 'y'.repeat(43) },
      { method: 'POST', headers: {} },
      res,
    );

    expect(headers['Set-Cookie']).toBe(CLEAR_COOKIE);
  });

  it('cookie заявки гасится до вызова сервиса — очистка стоит, даже когда сервис бросает', async () => {
    const controller = await buildController({
      login: () => Promise.reject(new Error('код Google протух')),
    });
    const { res, headers } = fakeResponse();

    await expect(
      controller.login(
        { code: 'x'.repeat(20), state: 'y'.repeat(43) },
        { method: 'POST', headers: {} },
        res,
      ),
    ).rejects.toThrow('код Google протух');

    expect(headers['Set-Cookie']).toBe(CLEAR_COOKIE);
  });
});
