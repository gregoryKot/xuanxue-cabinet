// Test.createTestingModule с фейком сервиса — образец google-auth.controller.spec.ts.
// Главное, что проверяем: start() ставит cookie заявки, Location и 302; login()
// гасит telegram_oauth ДО обращения к сервису (SECURITY §2) и добавляет к
// очистке cookie сессии.
import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import type { RedirectResponseLike } from '../common/video-redirect';
import type { RequestLike, ResponseLike } from '../common/http-headers';
import type { UserLean } from '../users/users.service';
import { TelegramOidcController } from './telegram-oidc.controller';
import {
  TelegramOidcService,
  type TelegramOidcLoginResult,
  type TelegramOidcStartResult,
} from './telegram-oidc.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: [],
  status: 'active',
  studentMode: false,
};

const OAUTH_COOKIE = 'telegram_oauth=abc; HttpOnly; Path=/api/auth/telegram/oidc';
const SESSION_COOKIE = 'session=token; HttpOnly; Path=/';
const CLEAR_COOKIE =
  'telegram_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/telegram/oidc; Max-Age=0';
const BODY = { code: 'x'.repeat(20), state: 'y'.repeat(43) };

function fakeResponse(): {
  res: RedirectResponseLike & ResponseLike;
  headers: Record<string, string | string[]>;
  status: () => number | null;
} {
  const headers: Record<string, string | string[]> = {};
  let code: number | null = null;
  const res = {
    setHeader: (name: string, value: string | string[]) => {
      headers[name] = value;
    },
    status: (c: number) => {
      code = c;
    },
  };
  return { res, headers, status: () => code };
}

async function buildController(overrides: {
  start?: () => TelegramOidcStartResult;
  login?: TelegramOidcService['login'];
  hasActiveChatFor?: PersonalChats['hasActiveChatFor'];
}): Promise<TelegramOidcController> {
  const module = await Test.createTestingModule({
    controllers: [TelegramOidcController],
    providers: [
      {
        provide: TelegramOidcService,
        useValue: {
          start:
            overrides.start ??
            (() => {
              throw new Error('unused');
            }),
          login: overrides.login ?? (() => Promise.reject(new Error('unused'))),
        },
      },
      {
        provide: PersonalChats,
        useValue: {
          hasActiveChatFor: overrides.hasActiveChatFor ?? (() => Promise.resolve(false)),
        },
      },
    ],
  }).compile();
  return module.get(TelegramOidcController);
}

describe('TelegramOidcController.start', () => {
  it('cookie заявки, Location на Telegram и 302', async () => {
    const controller = await buildController({
      start: () => ({
        cookie: OAUTH_COOKIE,
        url: 'https://oauth.telegram.org/auth?state=…',
      }),
    });
    const { res, headers, status } = fakeResponse();

    controller.start('a'.repeat(32), res);

    expect(headers['Set-Cookie']).toBe(OAUTH_COOKIE);
    expect(headers.Location).toBe('https://oauth.telegram.org/auth?state=…');
    expect(status()).toBe(HttpStatus.FOUND);
  });

  it('join из query передан в TelegramOidcService.start', async () => {
    const received: Array<string | undefined> = [];
    const controller = await buildController({
      start: ((joinCode: string | undefined) => {
        received.push(joinCode);
        return { cookie: OAUTH_COOKIE, url: 'https://oauth.telegram.org/auth' };
      }) as () => TelegramOidcStartResult,
    });

    controller.start('a'.repeat(32), fakeResponse().res);
    controller.start(undefined, fakeResponse().res);

    expect(received).toEqual(['a'.repeat(32), undefined]);
  });
});

describe('TelegramOidcController.login', () => {
  const REQ: RequestLike = { method: 'POST', headers: { cookie: 'telegram_oauth=abc' } };

  it('две Set-Cookie: очистка заявки и новая сессия; ответ — MeDto', async () => {
    const controller = await buildController({
      login: () =>
        Promise.resolve<TelegramOidcLoginResult>({
          user: USER,
          cookies: [SESSION_COOKIE],
        }),
    });
    const { res, headers } = fakeResponse();

    const result = await controller.login(BODY, REQ, res);

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
      studentMode: false,
      canUseStudentMode: false,
      homeHiddenTiles: [],
    });
  });

  it('botChatActive приходит из PersonalChats.hasActiveChatFor, не хардкод', async () => {
    const controller = await buildController({
      login: () => Promise.resolve({ user: USER, cookies: [SESSION_COOKIE] }),
      hasActiveChatFor: () => Promise.resolve(true),
    });

    const result = await controller.login(BODY, REQ, fakeResponse().res);

    expect(result.botChatActive).toBe(true);
  });

  it('заголовок Cookie запроса и тело уходят в сервис', async () => {
    const calls: Array<{ body: unknown; cookie: string | undefined }> = [];
    const controller = await buildController({
      login: (body: unknown, cookie: string | undefined) => {
        calls.push({ body, cookie });
        return Promise.resolve({ user: USER, cookies: [] });
      },
    });

    await controller.login(BODY, REQ, fakeResponse().res);

    expect(calls).toEqual([{ body: BODY, cookie: 'telegram_oauth=abc' }]);
  });

  it('cookie заявки гасится до вызова сервиса — очистка стоит, даже когда сервис бросает', async () => {
    const controller = await buildController({
      login: () => Promise.reject(new Error('код Telegram протух')),
    });
    const { res, headers } = fakeResponse();

    await expect(controller.login(BODY, REQ, res)).rejects.toThrow('код Telegram протух');

    expect(headers['Set-Cookie']).toBe(CLEAR_COOKIE);
  });
});
