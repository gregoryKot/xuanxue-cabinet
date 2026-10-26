// e2e входа через Telegram по OpenID Connect (ADR-0187): вход целиком. Браузер
// изображает supertest-агент с банкой cookie (e2e-support/telegram-oidc-fixtures.ts):
// заявка `telegram_oauth` и сессия живут в ней как у человека — включая гашение
// cookie заявки ответом (одноразовость) и сценарий «войти, выйти, войти снова»,
// на котором сломался прежний вход 2026-10-22. Старт и отказы —
// telegram-oidc.e2e-spec.ts.
import type { MeDto } from '@xuanxue/shared';
import { readTelegramOAuthCookie } from '../src/auth/telegram-oidc-cookie';
import { TelegramOidcTokenClient } from '../src/auth/telegram-oidc-token-client';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import {
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_TELEGRAM_ID,
  createTelegramOidcHarness,
  oauthCookieFrom,
  setCookiesOf,
} from './e2e-support/telegram-oidc-fixtures';

describe('Telegram login по OIDC: вход (e2e)', () => {
  let testApp: TestApp;
  const harness = createTelegramOidcHarness(() => testApp);
  const { users, newAgent, loginFlow, currentInviteCode } = harness;

  beforeAll(async () => {
    testApp = await createTestApp(
      (builder) => {
        builder
          .overrideProvider(TelegramOidcTokenClient)
          .useValue(harness.tokenClientFake);
      },
      { TELEGRAM_LOGIN_CLIENT_SECRET: OIDC_CLIENT_SECRET },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    harness.reset();
  });

  it('существующий человек с telegramId — 200, сессия; /auth/me читает её (read-after-write)', async () => {
    const existing = await users().create({
      name: 'Анна',
      telegramId: OIDC_TELEGRAM_ID,
      roles: ['teacher'],
      status: 'active',
    });
    const agent = newAgent();

    const { login } = await loginFlow(agent);

    expect(login.status).toBe(200);
    expect((login.body as MeDto).id).toBe(existing._id.toString());
    expect(setCookiesOf(login).some((c) => c.startsWith('session='))).toBe(true);
    // Секрет клиента не уходит в ответ.
    expect(JSON.stringify(login.body)).not.toContain(OIDC_CLIENT_SECRET);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect((me.body as MeDto).id).toBe(existing._id.toString());
    expect((me.body as MeDto).telegramLinked).toBe(true);

    const reread = await users().findById(existing._id).lean();
    expect(reread?.lastLoginAt).toBeTruthy();
  });

  it('в обмен кода уходят verifier из cookie, code из тела и redirect_uri кабинета', async () => {
    await users().create({
      name: 'Анна',
      telegramId: 555_000_001,
      roles: [],
      status: 'active',
    });

    const { start } = await loginFlow(newAgent(), { id: 555_000_001 });

    const stored = readTelegramOAuthCookie(oauthCookieFrom(start).split(';')[0]);
    expect(harness.lastExchange()).toEqual({
      code: 'authorization-code-value',
      verifier: stored?.verifier,
      config: {
        clientId: OIDC_CLIENT_ID,
        clientSecret: OIDC_CLIENT_SECRET,
        redirectUri: 'http://localhost:3000/login/telegram',
      },
    });
  });

  it('повтор того же POST после успеха — 401: cookie заявки погашена ответом', async () => {
    await users().create({
      name: 'Анна',
      telegramId: 555_000_002,
      roles: [],
      status: 'active',
    });
    const agent = newAgent();
    const { start, login } = await loginFlow(agent, { id: 555_000_002 });
    expect(login.status).toBe(200);
    expect(setCookiesOf(login).some((c) => /^telegram_oauth=;.*Max-Age=0/.test(c))).toBe(
      true,
    );
    const stored = readTelegramOAuthCookie(oauthCookieFrom(start).split(';')[0]);
    harness.reset();

    const replay = await withCsrf(agent.post('/api/auth/telegram/oidc')).send({
      code: 'authorization-code-value',
      state: stored?.state,
    });

    expect(replay.status).toBe(401);
    expect(harness.lastExchange()).toBeNull();
  });

  // Тот самый путь, на котором сломался прежний вход (владелец, 2026-10-22):
  // человек вошёл, вышел и входит снова. Сама граница с Telegram в CI не
  // воспроизводится — её держит ручная проверка после выката (RUNBOOK §5), —
  // но всё, что на стороне кабинета, проходится целиком.
  it('войти, выйти, войти снова — второй вход так же открывает сессию', async () => {
    await users().create({
      name: 'Анна',
      telegramId: 555_000_003,
      roles: [],
      status: 'active',
    });
    const agent = newAgent();

    const first = await loginFlow(agent, { id: 555_000_003 });
    expect(first.login.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const logout = await withCsrf(agent.post('/api/auth/logout'));
    expect(logout.status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const second = await loginFlow(agent, { id: 555_000_003 });
    expect(second.login.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('claim id, а не sub, находит человека: sub с id другого аккаунта ничего не открывает', async () => {
    const victim = await users().create({
      name: 'Жертва',
      telegramId: 777_000_001,
      roles: [],
      status: 'active',
    });
    await users().create({
      name: 'Свой',
      telegramId: 777_000_002,
      roles: [],
      status: 'active',
    });

    const { login } = await loginFlow(newAgent(), {
      id: 777_000_002,
      sub: String(777_000_001),
    });

    expect(login.status).toBe(200);
    expect((login.body as MeDto).id).not.toBe(victim._id.toString());
    expect((login.body as MeDto).name).toBe('Свой');
  });

  it('незнакомый человек без приглашения — 403, аккаунт не создаётся', async () => {
    const { login } = await loginFlow(newAgent(), { id: 888_000_001 });

    expect(login.status).toBe(403);
    expect(await users().countDocuments({ telegramId: 888_000_001 })).toBe(0);
  });

  it('незнакомый человек с валидной ссылкой-приглашением — 200, аккаунт с именем из Telegram', async () => {
    const code = await currentInviteCode();

    const { login } = await loginFlow(newAgent(), { id: 888_000_002 }, code);

    expect(login.status).toBe(200);
    const created = await users().findOne({ telegramId: 888_000_002 }).lean();
    expect(created?.name).toBe('Анна Петрова');
    expect(created?.status).toBe('active');
    expect(created?.roles).toEqual([]);
  });

  it('мусор вместо кода приглашения не помогает — 403', async () => {
    const { login } = await loginFlow(newAgent(), { id: 888_000_003 }, 'z'.repeat(32));

    expect(login.status).toBe(403);
    expect(await users().countDocuments({ telegramId: 888_000_003 })).toBe(0);
  });

  it('заблокированный — 403 без сессии', async () => {
    await users().create({
      name: 'Бывший',
      telegramId: 999_000_001,
      roles: [],
      status: 'blocked',
    });

    const { login } = await loginFlow(newAgent(), { id: 999_000_001 });

    expect(login.status).toBe(403);
    expect(setCookiesOf(login).some((c) => c.startsWith('session='))).toBe(false);
  });
});
