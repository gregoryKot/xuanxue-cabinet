// e2e «штат открывает снимок перевода, загруженный в кабинете» (ADR-0149,
// GET /payments/:userId/:month/screenshot): доступ — бухгалтер и админ, как
// весь /payments (ADR-0049); учитель, помощник и ученик получают 403, без
// сессии — 401. Байты после загрузки учеником (POST /me/payments/:month/
// screenshot, ADR-0050) возвращаются байт в байт, а в самом списке снимок
// виден только видом `screenshotKind` — ни байтов, ни id (SECURITY §4).
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type {
  ApiErrorBody,
  MyPaymentDto,
  PaymentDto,
  PaymentsPageDto,
} from '@xuanxue/shared';
import {
  PAYMENT_SCREENSHOT_IN_TELEGRAM_MESSAGE,
  PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
} from '@xuanxue/shared';
import request from 'supertest';
import { PaymentRecord } from '../src/payments/payment.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { jpegBytes } from './e2e-support/exam-images-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const ZERO_ID = '000000000000000000000000';
// Не нули: снимок из одних нулей не отличил бы «те же байты» от «любых».
const SCREENSHOT_SIZE = 256;
const SCREENSHOT_MARKER = 0xdeadbeef;
const SCREENSHOT_MARKER_OFFSET = 100;

const FORBIDDEN_FIELDS = [
  'bytes',
  'hasScreenshot',
  'screenshotImageId',
  'screenshotFileId',
  'screenshotFileUniqueId',
  '_id',
  '__v',
];

// Текущий месяц — внутри окна загрузки (11 назад .. 1 вперёд, ADR-0050) при
// любой дате прогона; фиксированный '2026-09' через год перестал бы в него
// попадать.
function currentMonth(): string {
  return DateTime.utc().toFormat('yyyy-MM');
}

function screenshotBytes(): Buffer {
  const bytes = jpegBytes(SCREENSHOT_SIZE);
  bytes.writeUInt32BE(SCREENSHOT_MARKER, SCREENSHOT_MARKER_OFFSET);
  return bytes;
}

describe('Снимок перевода — штат открывает загрузку из кабинета (e2e)', () => {
  let testApp: TestApp;
  const month = currentMonth();

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function getScreenshot(
    userId: string,
    cookie: string | undefined,
    path = month,
  ): request.Test {
    const req = request(server()).get(`/api/payments/${userId}/${path}/screenshot`);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  async function studentWithUpload(
    name: string,
  ): Promise<{ userId: string; cookie: string; bytes: Buffer }> {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name,
      roles: [],
    });
    const bytes = screenshotBytes();
    const res = await withCsrf(
      request(server()).post(`/api/me/payments/${month}/screenshot`),
    )
      .set('Cookie', cookie)
      .set('Content-Type', 'image/jpeg')
      .send(bytes);
    expect(res.status).toBe(201);
    return { userId, cookie, bytes };
  }

  it('без сессии — 401', async () => {
    const res = await getScreenshot(ZERO_ID, undefined);
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик (в том числе владелец снимка), учитель, помощник — 403, байты не отдаются', async () => {
    const { userId, cookie: ownerCookie } = await studentWithUpload('Ученик-владелец');
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const assistantCookie = await sessionCookieFor(testApp.app, ['assistant']);
    const otherStudentCookie = await sessionCookieFor(testApp.app, []);

    for (const cookie of [
      ownerCookie,
      otherStudentCookie,
      teacherCookie,
      assistantCookie,
    ]) {
      const res = await getScreenshot(userId, cookie);
      expect(res.status).toBe(403);
      expect((res.body as ApiErrorBody).code).toBe('forbidden');
    }
  });

  it('бухгалтер и админ получают ровно те байты, что загрузил ученик; no-store, тип из данных', async () => {
    const { userId, bytes } = await studentWithUpload('Ученик со снимком');
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);

    for (const cookie of [accountantCookie, adminCookie]) {
      const res = await getScreenshot(userId, cookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
    }
  });

  it('месяц без снимка и несуществующий ученик — 404 с текстом «снимка нет»', async () => {
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    const { userId } = await createUserWithSession(testApp.app, {
      name: 'Ученик без снимка',
      roles: [],
    });

    for (const id of [userId, ZERO_ID, 'не-id']) {
      const res = await getScreenshot(id, accountantCookie);
      expect(res.status).toBe(404);
      expect((res.body as ApiErrorBody).code).toBe('not_found');
      expect((res.body as ApiErrorBody).message).toBe(
        PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
      );
    }
  });

  it('снимок другого месяца ученику не подсовывается; кривой месяц — 400', async () => {
    const { userId } = await studentWithUpload('Ученик с одним месяцем');
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    const otherMonth = DateTime.utc().minus({ months: 1 }).toFormat('yyyy-MM');

    expect((await getScreenshot(userId, accountantCookie, otherMonth)).status).toBe(404);
    expect((await getScreenshot(userId, accountantCookie, '2026-9')).status).toBe(400);
  });

  it('снимок из бота — 404 с текстом, что он лежит в Telegram', async () => {
    const { userId } = await createUserWithSession(testApp.app, {
      name: 'Ученик со снимком в боте',
      roles: [],
    });
    const paymentModel = testApp.app.get<Model<PaymentRecord>>(
      getModelToken(PaymentRecord.name),
      { strict: false },
    );
    await paymentModel.create({
      userId,
      month,
      status: 'awaiting',
      screenshotKind: 'telegram',
    });
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);

    const res = await getScreenshot(userId, accountantCookie);

    expect(res.status).toBe(404);
    expect((res.body as ApiErrorBody).message).toBe(
      PAYMENT_SCREENSHOT_IN_TELEGRAM_MESSAGE,
    );
  });

  it('список: строка ученика несёт screenshotKind upload и не несёт байты, id и hasScreenshot', async () => {
    const name = 'Ученик для списка бухгалтера';
    await studentWithUpload(name);
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);

    const list = await request(server())
      .get(`/api/payments?month=${month}`)
      .set('Cookie', accountantCookie);

    expect(list.status).toBe(200);
    const row = (list.body as PaymentsPageDto).rows.find((r) => r.userName === name);
    expect(row?.screenshotKind).toBe('upload');
    for (const field of FORBIDDEN_FIELDS) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it('read-after-write: бухгалтер подтверждает — ученик в /me/payments видит paid, снимок ещё открывается', async () => {
    const {
      userId,
      cookie: studentCookie,
      bytes,
    } = await studentWithUpload('Ученик для подтверждения');
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);

    const confirmed = await withCsrf(
      request(server()).post(`/api/payments/${userId}/${month}/confirm`),
    )
      .set('Cookie', accountantCookie)
      .send({});
    expect(confirmed.status).toBe(200);
    expect((confirmed.body as PaymentDto).status).toBe('paid');

    const mine = await request(server())
      .get('/api/me/payments')
      .set('Cookie', studentCookie);
    const row = (mine.body as MyPaymentDto[]).find((r) => r.month === month);
    expect(row?.status).toBe('paid');
    // После подтверждения снимок живёт ещё 30 дней (ADR-0050) и открывается.
    const after = await getScreenshot(userId, accountantCookie);
    expect(after.status).toBe(200);
    expect(Buffer.compare(after.body as Buffer, bytes)).toBe(0);
  });
});
