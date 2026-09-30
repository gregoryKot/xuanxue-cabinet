// e2e на GET /users/:id/export (ADR-0160, RUNBOOK §8.22): выгрузку отдаёт
// только admin (данные человека целиком — SECURITY §3), чужой и невалидный id
// — 404, в ответе нет секретов, а данные одного человека не подмешиваются к
// другому. Содержимое по коллекциям проверяет user-export.service.spec.ts на
// настоящей Mongo; здесь — доступ и то, что уходит по HTTP.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { UserDataExportDto, UserRole } from '@xuanxue/shared';
import { PaymentRecord } from '../src/payments/payment.schema';
import { PushSubscriptionRecord } from '../src/push/push-subscription.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { createUsersTestHelpers } from './e2e-support/users-fixtures';

const SECRET = 'СЕКРЕТ-НЕ-ДЛЯ-ВЫГРУЗКИ';
const UNKNOWN_ID = '507f1f77bcf86cd799439011';

describe('GET /users/:id/export (e2e)', () => {
  let testApp: TestApp;
  let paymentModel: Model<PaymentRecord>;
  let pushModel: Model<PushSubscriptionRecord>;
  const { server, userModel, sessionFor, createUser } = createUsersTestHelpers(
    () => testApp,
  );

  function exportOf(cookie: string | null, id: string): request.Test {
    const req = request(server()).get(`/api/users/${id}/export`);
    return cookie === null ? req : req.set('Cookie', cookie);
  }

  async function adminCookie(): Promise<string> {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Админ',
      roles: ['admin'],
    });
    return cookie;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    paymentModel = testApp.app.get<Model<PaymentRecord>>(
      getModelToken(PaymentRecord.name),
      { strict: false },
    );
    pushModel = testApp.app.get<Model<PushSubscriptionRecord>>(
      getModelToken(PushSubscriptionRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await Promise.all([
      userModel().deleteMany({}),
      paymentModel.deleteMany({}),
      pushModel.deleteMany({}),
    ]);
  });

  it('без cookie — 401', async () => {
    const target = await createUser();

    expect((await exportOf(null, target.id)).status).toBe(401);
  });

  it.each([
    ['ученик', [] as UserRole[]],
    ['учитель', ['teacher'] as UserRole[]],
    // Помощник учителя правами равен учителю везде, кроме UsersController
    // (docs/SECURITY.md §2): чужие данные целиком видит только admin.
    ['помощник учителя', ['assistant'] as UserRole[]],
    ['бухгалтер', ['accountant'] as UserRole[]],
  ])('%s: выгрузка чужих данных — 403', async (_label, roles) => {
    const cookie = await sessionFor(roles);
    const target = await createUser({ name: 'Анна' });

    const res = await exportOf(cookie, target.id);

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('Анна');
  });

  it('человек не выгружает данные другого ученика и по своему id, если он не admin', async () => {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    expect((await exportOf(cookie, userId)).status).toBe(403);
  });

  it('админ: 200, данные человека и заголовок «не кэшировать»', async () => {
    const cookie = await adminCookie();
    const target = await createUser({ name: 'Анна', email: 'anna@example.com' });
    await paymentModel.create({
      userId: target.id,
      month: '2026-09',
      status: 'paid',
      amountMinor: 25000,
    });

    const res = await exportOf(cookie, target.id);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const body = res.body as UserDataExportDto;
    const account = body.sections.find((s) => s.key === 'UserRecord');
    expect(account?.records[0]).toMatchObject({
      id: target.id,
      name: 'Анна',
      email: 'anna@example.com',
    });
    const payments = body.sections.find((s) => s.key === 'PaymentRecord');
    expect(payments?.records[0]).toMatchObject({ month: '2026-09', amountMinor: 25000 });
  });

  it('данные другого человека не попадают в выгрузку, а секретов в ответе нет', async () => {
    const cookie = await adminCookie();
    const anna = await createUser({ name: 'Анна' });
    const boris = await createUser({ name: 'Борис', email: 'boris@example.com' });
    await pushModel.create({
      userId: anna.id,
      endpoint: `https://push.example/${SECRET}`,
      p256dh: SECRET,
      auth: SECRET,
    });
    await paymentModel.create({ userId: boris.id, month: '2026-09', status: 'paid' });

    const res = await exportOf(cookie, anna.id);

    const text = JSON.stringify(res.body);
    expect(res.status).toBe(200);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('Борис');
    expect(text).not.toContain('boris@example.com');
    const payments = (res.body as UserDataExportDto).sections.find(
      (s) => s.key === 'PaymentRecord',
    );
    expect(payments?.records).toEqual([]);
    const push = (res.body as UserDataExportDto).sections.find(
      (s) => s.key === 'PushSubscriptionRecord',
    );
    expect(push?.records).toHaveLength(1);
  });

  it('несуществующий и невалидный id — 404 с понятным текстом', async () => {
    const cookie = await adminCookie();

    const unknown = await exportOf(cookie, UNKNOWN_ID);
    const invalid = await exportOf(cookie, 'не-id');

    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(404);
    expect((unknown.body as { message: string }).message).toContain(
      'Пользователь не найден',
    );
  });
});
