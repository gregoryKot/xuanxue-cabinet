// e2e на доступ по роли и владение «Оплат» (docs/PLAN.md §15, ADR-0049,
// SECURITY §3): `/payments` — только бухгалтер и админ (учитель и помощник
// учителя — 403, ключевая проверка ADR-0049: деньги ученика не «данные
// школы» наравне с расписанием); `/me/payments` — владение по сессии, не по
// параметру пути. Образец и инструкция — api/test/e2e-support/README.md.
import type {
  ApiErrorBody,
  MyPaymentDto,
  PaymentDto,
  PaymentsPageDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const ZERO_ID = '000000000000000000000000';

describe('Оплаты — доступ по роли и владение (e2e)', () => {
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

  it('без сессии — 401 на всех маршрутах', async () => {
    expect((await request(server()).get('/api/payments')).status).toBe(401);
    expect((await request(server()).get('/api/me/payments')).status).toBe(401);
    expect(
      (await withCsrf(request(server()).post(`/api/payments/${ZERO_ID}/2026-09/confirm`)))
        .status,
    ).toBe(401);
    expect(
      (await withCsrf(request(server()).post(`/api/payments/${ZERO_ID}/2026-09/revoke`)))
        .status,
    ).toBe(401);
  });

  it('ученик, учитель, помощник учителя — 403 на /payments; бухгалтер и админ — 200', async () => {
    const studentCookie = await sessionCookieFor(testApp.app, []);
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const assistantCookie = await sessionCookieFor(testApp.app, ['assistant']);
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);

    expect(
      (await request(server()).get('/api/payments').set('Cookie', studentCookie)).status,
    ).toBe(403);
    expect(
      (await request(server()).get('/api/payments').set('Cookie', teacherCookie)).status,
    ).toBe(403);
    expect(
      (await request(server()).get('/api/payments').set('Cookie', assistantCookie))
        .status,
    ).toBe(403);
    expect(
      (await request(server()).get('/api/payments').set('Cookie', accountantCookie))
        .status,
    ).toBe(200);
    expect(
      (await request(server()).get('/api/payments').set('Cookie', adminCookie)).status,
    ).toBe(200);
  });

  it('учитель и помощник — 403 и на confirm/revoke, не только на список', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const assistantCookie = await sessionCookieFor(testApp.app, ['assistant']);

    const confirmTeacher = await withCsrf(
      request(server()).post(`/api/payments/${ZERO_ID}/2026-09/confirm`),
    ).set('Cookie', teacherCookie);
    expect(confirmTeacher.status).toBe(403);

    const revokeAssistant = await withCsrf(
      request(server()).post(`/api/payments/${ZERO_ID}/2026-09/revoke`),
    ).set('Cookie', assistantCookie);
    expect(revokeAssistant.status).toBe(403);
  });

  it(
    'бухгалтер подтверждает — читает после записи ученик А; ученик Б чужой месяц не видит; ' +
      'секретные поля нигде не утекают',
    async () => {
      const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
      const { userId: studentAId, cookie: studentACookie } = await createUserWithSession(
        testApp.app,
        { name: 'Ученик А', roles: [] },
      );
      const { cookie: studentBCookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик Б',
        roles: [],
      });

      const confirmRes = await withCsrf(
        request(server()).post(`/api/payments/${studentAId}/2026-09/confirm`),
      )
        .set('Cookie', accountantCookie)
        .send({ amountMinor: 25000, note: 'перевод от 5 сентября' });

      expect(confirmRes.status).toBe(200);
      const confirmed = confirmRes.body as PaymentDto;
      expect(confirmed.status).toBe('paid');
      expect(confirmed.userId).toBe(studentAId);
      for (const secret of [
        'note',
        '_id',
        '__v',
        'screenshotFileId',
        'screenshotFileUniqueId',
      ]) {
        expect(confirmRes.body).not.toHaveProperty(secret);
      }

      // Read-after-write: ученик А видит «оплачено» у себя.
      const myA = await request(server())
        .get('/api/me/payments')
        .set('Cookie', studentACookie);
      expect(myA.status).toBe(200);
      expect(
        (myA.body as MyPaymentDto[]).find((row) => row.month === '2026-09')?.status,
      ).toBe('paid');

      // Ученик Б не видит месяц ученика А (владение по сессии).
      const myB = await request(server())
        .get('/api/me/payments')
        .set('Cookie', studentBCookie);
      expect(myB.status).toBe(200);
      expect(
        (myB.body as MyPaymentDto[]).find((row) => row.month === '2026-09'),
      ).toBeUndefined();

      // Список бухгалтера — та же строка, без секретных полей.
      const list = await request(server())
        .get('/api/payments?month=2026-09')
        .set('Cookie', accountantCookie);
      expect(list.status).toBe(200);
      const row = (list.body as PaymentsPageDto).rows.find(
        (r) => r.userId === studentAId,
      );
      expect(row?.status).toBe('paid');
      for (const secret of [
        'note',
        '_id',
        '__v',
        'screenshotFileId',
        'screenshotFileUniqueId',
      ]) {
        expect(row).not.toHaveProperty(secret);
      }
    },
  );

  it('чужой userId в теле confirm — 400, не подмена (владелец только из пути)', async () => {
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    const { userId: studentAId } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { userId: studentBId } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });

    // ConfirmPaymentDto не знает поля userId (whitelist: true,
    // forbidNonWhitelisted: true, app.setup.ts) — владелец абонемента
    // всегда берётся из :userId пути, тело лишнее поле не пропускает.
    const res = await withCsrf(
      request(server()).post(`/api/payments/${studentAId}/2026-09/confirm`),
    )
      .set('Cookie', accountantCookie)
      .send({ amountMinor: 1000, userId: studentBId });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('несуществующий месяц в пути — 400, не 500', async () => {
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    const { userId: studentId } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await withCsrf(
      request(server()).post(`/api/payments/${studentId}/2026-13/confirm`),
    ).set('Cookie', accountantCookie);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });
});
