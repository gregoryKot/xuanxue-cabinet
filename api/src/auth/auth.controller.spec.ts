// Test.createTestingModule с фейками провайдеров — образец
// health.controller.spec.ts: без HTTP, без Mongo.
import { DateTime } from 'luxon';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { fakeResponse } from '../test-support/http-fakes';
import type { UserLean } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { RequestLike } from '../common/http-headers';
import { TelegramAuthService } from './telegram-auth.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  email: 'maria@example.com',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

async function buildController(
  telegramLogin: TelegramAuthService['login'] = () => {
    return Promise.reject(new Error('не ожидался вызов в этом тесте'));
  },
  env: Record<string, string | undefined> = {},
): Promise<AuthController> {
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: { logoutCookie: () => 'session=; Max-Age=0' } },
      { provide: TelegramAuthService, useValue: { login: telegramLogin } },
      { provide: ConfigService, useValue: { get: (name: string) => env[name] } },
    ],
  }).compile();
  return module.get(AuthController);
}

describe('AuthController.getConfig', () => {
  it('без BOT_TOKEN — telegramBotId отсутствует', async () => {
    const controller = await buildController(undefined, {
      PUBLIC_URL: 'https://x.example',
    });
    expect(controller.getConfig()).toEqual({
      telegramBotId: undefined,
      publicUrl: 'https://x.example',
    });
  });

  it('с BOT_TOKEN — telegramBotId — числовой префикс токена', async () => {
    const controller = await buildController(undefined, {
      BOT_TOKEN: '123456:abcDEFghi-token_padding_here',
      PUBLIC_URL: 'https://xuanxue.su',
    });
    expect(controller.getConfig()).toEqual({
      telegramBotId: 123456,
      publicUrl: 'https://xuanxue.su',
    });
  });
});

describe('AuthController.me', () => {
  it('возвращает MeDto для пользователя, которого положил гвард', async () => {
    const controller = await buildController();
    expect(controller.me(USER)).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
    });
  });
});

describe('AuthController.logout', () => {
  it('ставит Set-Cookie из AuthService.logoutCookie()', async () => {
    const controller = await buildController();
    const res = fakeResponse();
    controller.logout(res);
    expect(res.headers['Set-Cookie']).toBe('session=; Max-Age=0');
  });
});

const TELEGRAM_INPUT: TelegramLoginInput = {
  id: 42,
  first_name: 'Мария',
  auth_date: Math.floor(DateTime.utc().toSeconds()),
  hash: 'a'.repeat(64),
};

function fakeRequest(body: Record<string, unknown>): RequestLike {
  return { method: 'POST', headers: {}, body };
}

describe('AuthController.loginWithTelegram', () => {
  it('ставит Set-Cookie из результата TelegramAuthService.login() и возвращает MeDto', async () => {
    const controller = await buildController(() =>
      Promise.resolve({ user: USER, cookie: 'session=tok' }),
    );
    const res = fakeResponse();

    const me = await controller.loginWithTelegram(
      TELEGRAM_INPUT,
      fakeRequest({ ...TELEGRAM_INPUT }),
      res,
    );

    expect(res.headers['Set-Cookie']).toBe('session=tok');
    expect(me).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
    });
  });

  it('передаёт в сервис req.body целиком, а не только поля DTO', async () => {
    let receivedRawBody: Record<string, unknown> | undefined;
    const controller = await buildController((_dto, rawBody) => {
      receivedRawBody = rawBody;
      return Promise.resolve({ user: USER, cookie: 'session=tok' });
    });
    const rawBody = { ...TELEGRAM_INPUT, unknown_field: 'от клиента' };

    await controller.loginWithTelegram(
      TELEGRAM_INPUT,
      fakeRequest(rawBody),
      fakeResponse(),
    );

    expect(receivedRawBody).toEqual(rawBody);
  });

  it('ошибка TelegramAuthService.login() пробрасывается наружу без Set-Cookie', async () => {
    const controller = await buildController(() =>
      Promise.reject(new Error('подпись не сошлась')),
    );
    const res = fakeResponse();

    await expect(
      controller.loginWithTelegram(
        TELEGRAM_INPUT,
        fakeRequest({ ...TELEGRAM_INPUT }),
        res,
      ),
    ).rejects.toThrow('подпись не сошлась');
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});
