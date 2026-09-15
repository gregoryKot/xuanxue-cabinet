// Test.createTestingModule с фейками провайдеров — образец
// health.controller.spec.ts: без HTTP, без Mongo.
import { DateTime } from 'luxon';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_PREVIEW_MINUTES,
  type SettingsDto,
  type TelegramLoginInput,
} from '@xuanxue/shared';
import { fakeResponse } from '../test-support/http-fakes';
import { SettingsService } from '../settings/settings.service';
import type { UserLean } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import type { RequestLike } from '../common/http-headers';
import { TelegramAuthService } from './telegram-auth.service';

const SETTINGS_WITHOUT_SITE: SettingsDto = {
  templates: { lesson_link: 'ссылка', recording: 'запись' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  updatedAt: '2026-09-06T18:00:00.000Z',
};

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
  settings: SettingsDto = SETTINGS_WITHOUT_SITE,
  // Имя бота приходит из уже прогретого botInfo — в тестах подменяем фейком,
  // сети тут нет (CLAUDE.md «Тесты»).
  botUsername: string | undefined = undefined,
): Promise<AuthController> {
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: { logoutCookie: () => 'session=; Max-Age=0' } },
      { provide: TelegramAuthService, useValue: { login: telegramLogin } },
      {
        provide: EmailAuthService,
        useValue: {
          requestLink: () => Promise.reject(new Error('не ожидался вызов в этом тесте')),
          verify: () => Promise.reject(new Error('не ожидался вызов в этом тесте')),
        },
      },
      { provide: ConfigService, useValue: { get: (name: string) => env[name] } },
      { provide: SettingsService, useValue: { get: () => Promise.resolve(settings) } },
      { provide: TelegramBotService, useValue: { botUsername: () => botUsername } },
    ],
  }).compile();
  return module.get(AuthController);
}

describe('AuthController.getConfig', () => {
  it('без BOT_TOKEN — telegramBotId отсутствует', async () => {
    const controller = await buildController(undefined, {}, SETTINGS_WITHOUT_SITE);
    await expect(controller.getConfig()).resolves.toEqual({
      telegramBotId: undefined,
      telegramBotUsername: undefined,
      schoolSiteUrl: undefined,
    });
  });

  it('с BOT_TOKEN и заполненным адресом сайта — оба поля в ответе', async () => {
    const controller = await buildController(
      undefined,
      { BOT_TOKEN: '123456:abcDEFghi-token_padding_here' },
      { ...SETTINGS_WITHOUT_SITE, schoolSiteUrl: 'https://xuanxue.su' },
    );
    await expect(controller.getConfig()).resolves.toEqual({
      telegramBotId: 123456,
      telegramBotUsername: undefined,
      schoolSiteUrl: 'https://xuanxue.su',
    });
  });

  // Имя бота нужно кабинету для ссылки «Отправить видео» (ADR-0023): бот
  // ответил при старте — имя есть; не ответил — поля нет, и кнопки не будет.
  it('бот прогрет — имя бота в ответе', async () => {
    const controller = await buildController(
      undefined,
      { BOT_TOKEN: '123456:abcDEFghi-token_padding_here' },
      SETTINGS_WITHOUT_SITE,
      'xuanxue_bot',
    );
    await expect(controller.getConfig()).resolves.toMatchObject({
      telegramBotUsername: 'xuanxue_bot',
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
      status: 'active',
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
// loginWithTelegram теперь принимает `@Body()` нетипизированным
// (parse-telegram-login-body.ts валидирует сам) — тестам нужен обычный
// Record, не интерфейс TelegramLoginInput без индексной сигнатуры.
const TELEGRAM_RAW_BODY: Record<string, unknown> = { ...TELEGRAM_INPUT };

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
      TELEGRAM_RAW_BODY,
      fakeRequest(TELEGRAM_RAW_BODY),
      res,
    );

    expect(res.headers['Set-Cookie']).toBe('session=tok');
    expect(me).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
      status: 'active',
    });
  });

  it('передаёт в сервис req.body целиком, а не только поля DTO', async () => {
    let receivedRawBody: Record<string, unknown> | undefined;
    const controller = await buildController((_dto, rawBody) => {
      receivedRawBody = rawBody;
      return Promise.resolve({ user: USER, cookie: 'session=tok' });
    });
    const rawBody = { ...TELEGRAM_INPUT, unknown_field: 'от клиента' };

    await controller.loginWithTelegram(rawBody, fakeRequest(rawBody), fakeResponse());

    expect(receivedRawBody).toEqual(rawBody);
  });

  it('req.body отсутствует — сервису передаётся {}, а не undefined', async () => {
    let receivedRawBody: Record<string, unknown> | undefined;
    const controller = await buildController((_dto, rawBody) => {
      receivedRawBody = rawBody;
      return Promise.resolve({ user: USER, cookie: 'session=tok' });
    });
    const requestWithoutBody: RequestLike = { method: 'POST', headers: {} };

    await controller.loginWithTelegram(
      TELEGRAM_RAW_BODY,
      requestWithoutBody,
      fakeResponse(),
    );

    expect(receivedRawBody).toEqual({});
  });

  it('ошибка TelegramAuthService.login() пробрасывается наружу без Set-Cookie', async () => {
    const controller = await buildController(() =>
      Promise.reject(new Error('подпись не сошлась')),
    );
    const res = fakeResponse();

    await expect(
      controller.loginWithTelegram(
        TELEGRAM_RAW_BODY,
        fakeRequest(TELEGRAM_RAW_BODY),
        res,
      ),
    ).rejects.toThrow('подпись не сошлась');
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});
