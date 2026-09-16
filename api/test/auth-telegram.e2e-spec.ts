// e2e POST /auth/telegram через настоящий AppModule (SECURITY §2, ADR-0005) —
// подпись виджета, сессия, CSRF и троттлинг. Ветки, завязанные на ссылку-
// приглашение (ADR-0030/0034), — отдельным файлом auth-telegram-invite.e2e-spec.ts
// (файловый храповик не даёт одному e2e-файлу разрастись, CLAUDE.md
// «Храповики»). BOT_TOKEN и BOOTSTRAP_ADMIN_TELEGRAM_ID — тестовые константы
// из create-app.ts (setTestEnv). Кейс «без BOT_TOKEN» невозможен на одном
// AppModule — он в telegram-auth.service.spec.ts.
import request from 'supertest';
import { DateTime } from 'luxon';
import type { MeDto } from '@xuanxue/shared';
import {
  createTestApp,
  TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
  type TestApp,
} from './e2e-support/create-app';
import { freshIp, telegramLoginBody } from './e2e-support/telegram-widget-fixtures';

describe('POST /auth/telegram (e2e)', () => {
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

  function post(body: Record<string, unknown>, ip: string): request.Test {
    return request(server())
      .post('/api/auth/telegram')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(body);
  }

  it('успешный вход бутстрап-админа без кода — cookie, MeDto, роли admin+teacher', async () => {
    const res = await post(
      telegramLoginBody({ id: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID, first_name: 'Дима' }),
      freshIp(),
    );

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body).toMatchObject({ name: 'Дима', roles: ['admin', 'teacher'] });
    expect(String(res.headers['set-cookie'])).toContain('session=');
  });

  it('битый hash — 401', async () => {
    const body = { ...telegramLoginBody({ id: 777 }), hash: 'a'.repeat(64) };

    const res = await post(body, freshIp());

    expect(res.status).toBe(401);
  });

  it('протухший auth_date — 401', async () => {
    const staleAuthDate = Math.floor(DateTime.utc().minus({ days: 2 }).toSeconds());

    const res = await post(
      telegramLoginBody({ id: 888, auth_date: staleAuthDate }),
      freshIp(),
    );

    expect(res.status).toBe(401);
  });

  it('без x-requested-with — 403 (CSRF действует и для @Public())', async () => {
    const res = await request(server())
      .post('/api/auth/telegram')
      .set('x-forwarded-for', freshIp())
      .send(telegramLoginBody({ id: 999 }));

    expect(res.status).toBe(403);
  });

  it('11-й запрос с одного IP за минуту — 429 в конверте', async () => {
    const ip = freshIp();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await post(
        telegramLoginBody({ id: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID }),
        ip,
      );
      expect(res.status).toBe(200);
    }

    const res = await post(
      telegramLoginBody({ id: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID }),
      ip,
    );

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      statusCode: 429,
      code: 'rate_limited',
      message: 'Слишком много запросов. Подождите минуту и попробуйте ещё раз.',
    });
  }, 30_000);
});
