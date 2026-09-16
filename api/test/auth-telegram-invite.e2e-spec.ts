// e2e POST /auth/telegram — ветки ссылки-приглашения (ADR-0030/0034,
// SECURITY §2). Отделён от auth-telegram.e2e-spec.ts (файловый храповик,
// CLAUDE.md «Храповики»): там подпись/CSRF/троттлинг, здесь —
// LoginIdentityService целиком. Новый человек без ссылки-приглашения не
// заводится вовсе — код едет в query `?join=` (INVITE_QUERY_PARAM), не в
// теле: подпись Telegram считается по телу запроса целиком (telegram-login.ts),
// лишнее поле там сломало бы её.
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { Model } from 'mongoose';
import type { InviteLinkDto, MeDto, UserDto } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { freshIp, telegramLoginBody } from './e2e-support/telegram-widget-fixtures';

describe('POST /auth/telegram (e2e) — ссылка-приглашение', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function post(
    body: Record<string, unknown>,
    ip: string,
    inviteCode?: string,
  ): request.Test {
    const query = inviteCode ? `?join=${inviteCode}` : '';
    return request(server())
      .post(`/api/auth/telegram${query}`)
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(body);
  }

  async function currentInviteCode(): Promise<string> {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await withCsrf(request(server()).post('/api/users/invite-link')).set(
      'Cookie',
      adminCookie,
    );
    const url = (res.body as InviteLinkDto).url as string;
    return url.split('/join/')[1] as string;
  }

  it('новый человек без кода — 403, аккаунт не создаётся', async () => {
    const userModel = testApp.app.get<Model<UserRecord>>(getModelToken(UserRecord.name), {
      strict: false,
    });

    const res = await post(telegramLoginBody({ id: 700_001 }), freshIp());

    expect(res.status).toBe(403);
    expect(await userModel.countDocuments({ telegramId: 700_001 })).toBe(0);
  });

  it('новый человек с невалидным кодом — 403, аккаунт не создаётся', async () => {
    const res = await post(telegramLoginBody({ id: 700_002 }), freshIp(), '0'.repeat(32));

    expect(res.status).toBe(403);
  });

  it('новый человек с валидным кодом — 200, active, joinedViaInvite', async () => {
    const code = await currentInviteCode();

    const res = await post(
      telegramLoginBody({ id: 700_003, first_name: 'Ученик' }),
      freshIp(),
      code,
    );

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body.status).toBe('active');
    expect(body.roles).toEqual([]);

    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const list = await request(server()).get('/api/users').set('Cookie', adminCookie);
    const created = (list.body as UserDto[]).find((u) => u.id === body.id);
    expect(created?.joinedViaInvite).toBe(true);
  });

  it('существующий человек без кода — 200 как обычно, код игнорируется даже неверный', async () => {
    const ip = freshIp();
    const code = await currentInviteCode();
    const first = await post(
      telegramLoginBody({ id: 700_004, first_name: 'Ольга' }),
      ip,
      code,
    );
    expect(first.status).toBe(200);

    const second = await post(telegramLoginBody({ id: 700_004 }), ip);

    expect(second.status).toBe(200);
    expect((second.body as MeDto).id).toBe((first.body as MeDto).id);
  });

  it('blocked — 403 даже с валидным кодом', async () => {
    const userModel = testApp.app.get<Model<UserRecord>>(getModelToken(UserRecord.name), {
      strict: false,
    });
    await userModel.create({
      name: 'Заблокирован',
      telegramId: 700_005,
      roles: [],
      status: 'blocked',
    });
    const code = await currentInviteCode();

    const res = await post(telegramLoginBody({ id: 700_005 }), freshIp(), code);

    expect(res.status).toBe(403);
  });

  it('два параллельных первых входа одним id и валидным кодом — оба 200, в базе один пользователь', async () => {
    const ip = freshIp();
    const code = await currentInviteCode();
    const id = 424_242;

    const [first, second] = await Promise.all([
      post(telegramLoginBody({ id }), ip, code),
      post(telegramLoginBody({ id }), ip, code),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = first.body as MeDto;
    const secondBody = second.body as MeDto;
    expect(firstBody.id).toBe(secondBody.id);
  });

  it('все 7 полей виджета с верной подписью и валидным кодом — 200', async () => {
    const code = await currentInviteCode();
    const res = await post(
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
    const code = await currentInviteCode();
    const res = await post(
      telegramLoginBody({ id: 777_001, chat_instance: 'что-то от Telegram' }),
      freshIp(),
      code,
    );

    expect(res.status).toBe(200);
  });
});
