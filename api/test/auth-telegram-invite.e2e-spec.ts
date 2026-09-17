// e2e POST /auth/telegram — ветки ссылки-приглашения для НОВОГО человека
// (ADR-0030/0034, SECURITY §2): без кода, с невалидным кодом, с валидным,
// blocked. Отделён от auth-telegram.e2e-spec.ts (файловый храповик, CLAUDE.md
// «Храповики»): там подпись/CSRF/троттлинг, здесь — LoginIdentityService
// целиком. Существующий человек — auth-telegram-invite-existing.e2e-spec.ts
// (тот же приём, общий setup через createTelegramInviteHelpers). Новый
// человек без ссылки-приглашения не заводится вовсе — код едет в query
// `?join=`, не в теле: подпись Telegram считается по телу запроса целиком
// (telegram-login.ts), лишнее поле там сломало бы её.
import request from 'supertest';
import {
  ACCESS_MESSAGE,
  NO_INVITE_LINK_MESSAGE,
  type ApiErrorBody,
  type MeDto,
  type UserDto,
} from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';
import { createTelegramInviteHelpers } from './e2e-support/auth-telegram-invite-fixtures';
import { freshIp, telegramLoginBody } from './e2e-support/telegram-widget-fixtures';

describe('POST /auth/telegram (e2e) — ссылка-приглашение, новый человек', () => {
  let testApp: TestApp;
  const helpers = createTelegramInviteHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('новый человек без кода — 403, аккаунт не создаётся', async () => {
    const res = await helpers.post(telegramLoginBody({ id: 700_001 }), freshIp());

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    expect(await helpers.userModel().countDocuments({ telegramId: 700_001 })).toBe(0);
  });

  it('новый человек с невалидным кодом — 403, аккаунт не создаётся', async () => {
    const res = await helpers.post(
      telegramLoginBody({ id: 700_002 }),
      freshIp(),
      '0'.repeat(32),
    );

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    expect(await helpers.userModel().countDocuments({ telegramId: 700_002 })).toBe(0);
  });

  it('новый человек с валидным кодом — 200, active, joinedViaInvite', async () => {
    const code = await helpers.currentInviteCode();

    const res = await helpers.post(
      telegramLoginBody({ id: 700_003, first_name: 'Ученик' }),
      freshIp(),
      code,
    );

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body.status).toBe('active');
    expect(body.roles).toEqual([]);

    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const list = await request(helpers.server())
      .get('/api/users')
      .set('Cookie', adminCookie);
    const created = (list.body as UserDto[]).find((u) => u.id === body.id);
    expect(created?.joinedViaInvite).toBe(true);
  });

  it('blocked — 403 даже с валидным кодом', async () => {
    await helpers.userModel().create({
      name: 'Заблокирован',
      telegramId: 700_005,
      roles: [],
      status: 'blocked',
    });
    const code = await helpers.currentInviteCode();

    const res = await helpers.post(telegramLoginBody({ id: 700_005 }), freshIp(), code);

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(ACCESS_MESSAGE);
  });

  it('два параллельных первых входа одним id и валидным кодом — оба 200, в базе один пользователь', async () => {
    const ip = freshIp();
    const code = await helpers.currentInviteCode();
    const id = 424_242;

    const [first, second] = await Promise.all([
      helpers.post(telegramLoginBody({ id }), ip, code),
      helpers.post(telegramLoginBody({ id }), ip, code),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = first.body as MeDto;
    const secondBody = second.body as MeDto;
    expect(firstBody.id).toBe(secondBody.id);
  });

  it('все 7 полей виджета с верной подписью и валидным кодом — 200', async () => {
    const code = await helpers.currentInviteCode();
    const res = await helpers.post(
      telegramLoginBody({
        id: 654_321,
        first_name: 'Пётр',
        last_name: 'Иванов',
        username: 'petr_ivanov',
        photo_url: 'https://t.me/i/userpic/320/petr.jpg',
      }),
      freshIp(),
      code,
    );

    expect(res.status).toBe(200);
    expect((res.body as MeDto).name).toBe('Пётр Иванов');
  });

  it('дополнительное неизвестное поле, подписанное вместе с остальными, — 200', async () => {
    const code = await helpers.currentInviteCode();
    const res = await helpers.post(
      telegramLoginBody({ id: 777_001, chat_instance: 'что-то от Telegram' }),
      freshIp(),
      code,
    );

    expect(res.status).toBe(200);
  });
});
