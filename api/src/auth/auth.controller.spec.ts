// Test.createTestingModule с фейками провайдеров — образец
// health.controller.spec.ts: без HTTP, без Mongo.
import { DateTime } from 'luxon';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_MATERIALS_PAID_ACCESS,
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
import { PersonalChats } from '../telegram/personal-chats';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import type { RequestLike } from '../common/http-headers';
import { TelegramAuthService } from './telegram-auth.service';

const SETTINGS_WITHOUT_SITE: SettingsDto = {
  templates: { lesson_link: 'ссылка', recording: 'запись' },
  tz: 'Asia/Jerusalem',
  previewMinutes: DEFAULT_PREVIEW_MINUTES,
  materialsPaidAccess: DEFAULT_MATERIALS_PAID_ACCESS,
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
  emailLoginEnabled = false,
  // botChatActive — честный проброс из PersonalChats.hasActiveChatFor(user)
  // (ADR-0042), не хардкод в контроллере: дефолт false совпадает с
  // telegramLinked: false у USER ниже, отдельный тест ниже подменяет фейк на
  // true и проверяет, что значение долетает до ответа.
  hasActiveChatFor: PersonalChats['hasActiveChatFor'] = () => Promise.resolve(false),
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
          isEnabled: () => emailLoginEnabled,
        },
      },
      { provide: ConfigService, useValue: { get: (name: string) => env[name] } },
      { provide: SettingsService, useValue: { get: () => Promise.resolve(settings) } },
      { provide: TelegramBotService, useValue: { botUsername: () => botUsername } },
      { provide: PersonalChats, useValue: { hasActiveChatFor } },
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
      emailLoginEnabled: false,
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
      emailLoginEnabled: false,
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

  // EmailAuthService.isEnabled() — источник поля целиком (CLAUDE.md «Дубли»):
  // контроллер не пересчитывает условие сам, только проксирует.
  it('EmailAuthService.isEnabled() true — emailLoginEnabled true в ответе', async () => {
    const controller = await buildController(
      undefined,
      {},
      SETTINGS_WITHOUT_SITE,
      undefined,
      true,
    );
    await expect(controller.getConfig()).resolves.toMatchObject({
      emailLoginEnabled: true,
    });
  });
});

describe('AuthController.me', () => {
  it('возвращает MeDto для пользователя, которого положил гвард', async () => {
    const controller = await buildController();
    await expect(controller.me(USER)).resolves.toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: true,
    });
  });

  // botChatActive — не хардкод в контроллере, а честный проброс результата
  // PersonalChats.hasActiveChatFor(user) (ADR-0042): фейк отдаёт true,
  // проверяем, что это же значение долетает до MeDto.
  it('botChatActive приходит из PersonalChats.hasActiveChatFor(user)', async () => {
    const controller = await buildController(
      undefined,
      {},
      SETTINGS_WITHOUT_SITE,
      undefined,
      false,
      () => Promise.resolve(true),
    );

    await expect(controller.me(USER)).resolves.toMatchObject({ botChatActive: true });
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

describe('AuthController.requestEmailLogin', () => {
  it('передаёт email, now и inviteCode из тела в EmailAuthService.requestLink()', async () => {
    let received: { email: string; inviteCode: string | undefined } | undefined;
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: TelegramAuthService, useValue: {} },
        {
          provide: EmailAuthService,
          useValue: {
            requestLink: (email: string, _now: DateTime, inviteCode?: string) => {
              received = { email, inviteCode };
              return Promise.resolve();
            },
          },
        },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SettingsService, useValue: {} },
        { provide: TelegramBotService, useValue: {} },
        { provide: PersonalChats, useValue: {} },
      ],
    }).compile();
    const controller = module.get(AuthController);

    await controller.requestEmailLogin({
      email: 'maria@example.com',
      inviteCode: 'a'.repeat(32),
    });

    expect(received).toEqual({ email: 'maria@example.com', inviteCode: 'a'.repeat(32) });
  });
});

describe('AuthController.verifyEmailLogin', () => {
  it('ставит Set-Cookie из результата EmailAuthService.verify() и возвращает MeDto', async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: TelegramAuthService, useValue: {} },
        {
          provide: EmailAuthService,
          useValue: {
            verify: () => Promise.resolve({ user: USER, cookie: 'session=email-tok' }),
          },
        },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SettingsService, useValue: {} },
        { provide: TelegramBotService, useValue: {} },
        {
          provide: PersonalChats,
          useValue: { hasActiveChatFor: () => Promise.resolve(false) },
        },
      ],
    }).compile();
    const controller = module.get(AuthController);
    const res = fakeResponse();

    const me = await controller.verifyEmailLogin({ token: 'a'.repeat(64) }, res);

    expect(res.headers['Set-Cookie']).toBe('session=email-tok');
    expect(me).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: true,
    });
  });
});

// AuthController.checkInvite и AuthController.join переехали в
// JoinController (join.controller.spec.ts) — контроллер вынесен отдельным
// файлом (ревью владельца 2026-09-15, file-size-ratchet).

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
      undefined,
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
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: true,
    });
  });

  it('inviteCode из query передаётся в TelegramAuthService.login() четвёртым аргументом', async () => {
    let receivedInviteCode: string | undefined;
    const controller = await buildController((_dto, _rawBody, _now, inviteCode) => {
      receivedInviteCode = inviteCode;
      return Promise.resolve({ user: USER, cookie: 'session=tok' });
    });
    const code = 'a'.repeat(32);

    await controller.loginWithTelegram(
      TELEGRAM_RAW_BODY,
      code,
      fakeRequest(TELEGRAM_RAW_BODY),
      fakeResponse(),
    );

    expect(receivedInviteCode).toBe(code);
  });

  it('передаёт в сервис req.body целиком, а не только поля DTO', async () => {
    let receivedRawBody: Record<string, unknown> | undefined;
    const controller = await buildController((_dto, rawBody) => {
      receivedRawBody = rawBody;
      return Promise.resolve({ user: USER, cookie: 'session=tok' });
    });
    const rawBody = { ...TELEGRAM_INPUT, unknown_field: 'от клиента' };

    await controller.loginWithTelegram(
      rawBody,
      undefined,
      fakeRequest(rawBody),
      fakeResponse(),
    );

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
      undefined,
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
        undefined,
        fakeRequest(TELEGRAM_RAW_BODY),
        res,
      ),
    ).rejects.toThrow('подпись не сошлась');
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });
});
