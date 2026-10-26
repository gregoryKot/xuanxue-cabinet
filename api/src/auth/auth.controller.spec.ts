// Test.createTestingModule с фейками провайдеров — образец
// health.controller.spec.ts: без HTTP, без Mongo. Сборка GET /auth/config —
// AuthConfigService (auth-config.service.spec.ts), контроллер её только
// проксирует.
import { DateTime } from 'luxon';
import { Test } from '@nestjs/testing';
import { type AuthConfigDto, type TelegramLoginInput } from '@xuanxue/shared';
import { fakeResponse } from '../test-support/http-fakes';
import type { UserLean } from '../users/users.service';
import { AuthConfigService } from './auth-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { PersonalChats } from '../telegram/personal-chats';
import type { RequestLike } from '../common/http-headers';
import { TelegramAuthService } from './telegram-auth.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Мария',
  email: 'maria@example.com',
  roles: ['admin'],
  status: 'active',
  studentMode: false,
};

const CONFIG: AuthConfigDto = {
  telegramBotId: 123456,
  emailLoginEnabled: false,
  googleLoginEnabled: false,
  telegramOidcEnabled: true,
  fileStorageEnabled: false,
};

async function buildController(
  telegramLogin: TelegramAuthService['login'] = () => {
    return Promise.reject(new Error('не ожидался вызов в этом тесте'));
  },
  // botChatActive — честный проброс из PersonalChats.hasActiveChatFor(user)
  // (ADR-0042), не хардкод в контроллере: дефолт false совпадает с
  // telegramLinked: false у USER ниже, отдельный тест подменяет фейк на
  // true и проверяет, что значение долетает до ответа.
  hasActiveChatFor: PersonalChats['hasActiveChatFor'] = () => Promise.resolve(false),
): Promise<AuthController> {
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      {
        provide: AuthService,
        useValue: { logoutCookies: () => ['session=; Max-Age=0'] },
      },
      { provide: TelegramAuthService, useValue: { login: telegramLogin } },
      {
        provide: EmailAuthService,
        useValue: {
          requestLink: () => Promise.reject(new Error('не ожидался вызов в этом тесте')),
          verify: () => Promise.reject(new Error('не ожидался вызов в этом тесте')),
        },
      },
      { provide: AuthConfigService, useValue: { get: () => Promise.resolve(CONFIG) } },
      { provide: PersonalChats, useValue: { hasActiveChatFor } },
    ],
  }).compile();
  return module.get(AuthController);
}

describe('AuthController.getConfig', () => {
  it('отдаёт то, что собрал AuthConfigService, без правок по дороге', async () => {
    const controller = await buildController();
    await expect(controller.getConfig()).resolves.toBe(CONFIG);
  });
});

describe('AuthController.me', () => {
  it('возвращает MeDto для пользователя, которого положил гвард', async () => {
    const controller = await buildController();
    await expect(controller.me(USER)).resolves.toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      email: 'maria@example.com',
      hasEmail: true,
      googleLinked: false,
      noTelegram: false,
      needsProfile: true,
      studentMode: false,
      canUseStudentMode: true,
      homeHiddenTiles: [],
    });
  });

  // botChatActive — не хардкод в контроллере, а честный проброс результата
  // PersonalChats.hasActiveChatFor(user) (ADR-0042): фейк отдаёт true,
  // проверяем, что это же значение долетает до MeDto.
  it('botChatActive приходит из PersonalChats.hasActiveChatFor(user)', async () => {
    const controller = await buildController(undefined, () => Promise.resolve(true));

    await expect(controller.me(USER)).resolves.toMatchObject({ botChatActive: true });
  });
});

describe('AuthController.logout', () => {
  it('ставит Set-Cookie из AuthService.logoutCookies()', async () => {
    const controller = await buildController();
    const res = fakeResponse();
    controller.logout(res);
    expect(res.headers['Set-Cookie']).toEqual(['session=; Max-Age=0']);
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
        { provide: AuthConfigService, useValue: {} },
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
            verify: () => Promise.resolve({ user: USER, cookies: ['session=email-tok'] }),
          },
        },
        { provide: AuthConfigService, useValue: {} },
        {
          provide: PersonalChats,
          useValue: { hasActiveChatFor: () => Promise.resolve(false) },
        },
      ],
    }).compile();
    const controller = module.get(AuthController);
    const res = fakeResponse();

    const me = await controller.verifyEmailLogin({ token: 'a'.repeat(64) }, res);

    expect(res.headers['Set-Cookie']).toEqual(['session=email-tok']);
    expect(me).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      email: 'maria@example.com',
      hasEmail: true,
      googleLinked: false,
      noTelegram: false,
      needsProfile: true,
      studentMode: false,
      canUseStudentMode: true,
      homeHiddenTiles: [],
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
      Promise.resolve({ user: USER, cookies: ['session=tok'] }),
    );
    const res = fakeResponse();

    const me = await controller.loginWithTelegram(
      TELEGRAM_RAW_BODY,
      undefined,
      fakeRequest(TELEGRAM_RAW_BODY),
      res,
    );

    expect(res.headers['Set-Cookie']).toEqual(['session=tok']);
    expect(me).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      email: 'maria@example.com',
      hasEmail: true,
      googleLinked: false,
      noTelegram: false,
      needsProfile: true,
      studentMode: false,
      canUseStudentMode: true,
      homeHiddenTiles: [],
    });
  });

  it('inviteCode из query передаётся в TelegramAuthService.login() четвёртым аргументом', async () => {
    let receivedInviteCode: string | undefined;
    const controller = await buildController((_dto, _rawBody, _now, inviteCode) => {
      receivedInviteCode = inviteCode;
      return Promise.resolve({ user: USER, cookies: ['session=tok'] });
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
      return Promise.resolve({ user: USER, cookies: ['session=tok'] });
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
      return Promise.resolve({ user: USER, cookies: ['session=tok'] });
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
