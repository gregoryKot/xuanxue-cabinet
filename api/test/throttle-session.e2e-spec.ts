// Троттлер на настоящем AppModule (ADR-0164, CLAUDE.md правило 4): вошедший
// считается по сессии, не по IP. Регрессия на нагрузочный тест аудита
// 2026-10-01: ученики за одним NAT делили 120 запросов в минуту на всех и
// получали 429 на автосохранении ответов. Лимит здесь берётся настоящий
// (app.module.ts), поэтому первый тест делает 120 запросов подряд — на
// in-memory Mongo это секунда.
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { freshIp } from './e2e-support/telegram-widget-fixtures';

const LIMIT_PER_MINUTE = 120;

describe('ThrottlerGuard: бакет по сессии (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function get(path: string, ip: string, cookie?: string): request.Test {
    const req = request(testApp.app.getHttpServer()).get(path).set('x-forwarded-for', ip);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  async function exhaust(path: string, ip: string, cookie?: string): Promise<void> {
    for (let i = 0; i < LIMIT_PER_MINUTE; i++) {
      const res = await get(path, ip, cookie);
      expect(res.status).toBe(200);
    }
  }

  it('два вошедших за одним IP: первый выбрал свой лимит — 429 ему, второму с того же IP 200', async () => {
    const ip = freshIp();
    const first = await createUserWithSession(testApp.app, { name: 'Первый', roles: [] });
    const second = await createUserWithSession(testApp.app, {
      name: 'Второй',
      roles: [],
    });

    await exhaust('/api/auth/me', ip, first.cookie);
    const blocked = await get('/api/auth/me', ip, first.cookie);
    const neighbour = await get('/api/auth/me', ip, second.cookie);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ statusCode: 429, code: 'rate_limited' });
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(neighbour.status).toBe(200);
  });

  it('тот же вошедший с другого IP — тот же бакет: 429 остаётся', async () => {
    const user = await createUserWithSession(testApp.app, { name: 'Один', roles: [] });

    await exhaust('/api/auth/me', freshIp(), user.cookie);
    const fromAnotherNetwork = await get('/api/auth/me', freshIp(), user.cookie);

    expect(fromAnotherNetwork.status).toBe(429);
  });

  it('без сессии — по IP: 121-й запрос с одного IP — 429, с другого — 200', async () => {
    const ip = freshIp();

    await exhaust('/api/auth/config', ip);
    const sameIp = await get('/api/auth/config', ip);
    const otherIp = await get('/api/auth/config', freshIp());

    expect(sameIp.status).toBe(429);
    expect(otherIp.status).toBe(200);
  });

  it('битая cookie не даёт своего бакета — считается по IP вместе с остальными', async () => {
    const ip = freshIp();

    await exhaust('/api/auth/config', ip);
    const forged = await get('/api/auth/config', ip, 'session=a.b.c');

    expect(forged.status).toBe(429);
  });
});
