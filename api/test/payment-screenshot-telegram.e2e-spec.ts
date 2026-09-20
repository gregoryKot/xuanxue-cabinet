// Read-after-write (CLAUDE.md «Тесты»): бот принял скриншот (ADR-0050) →
// GET /me/payments того же ученика показывает `awaiting`/`hasScreenshot:
// true`, без `file_id`/`fileUniqueId` в ответе — тот же приём, что
// exam-media-telegram.e2e-spec.ts для видео экзамена. Сама привязка из бота —
// не HTTP, вызывается тем же PaymentsService.attachScreenshot, что и
// PaymentScreenshotMessageHandler; дальше — настоящий маршрут кабинета.
// Настоящий AppModule на MongoMemoryServer.
import { DateTime } from 'luxon';
import type { MyPaymentDto } from '@xuanxue/shared';
import request from 'supertest';
import { PaymentsService } from '../src/payments/payments.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';

const FILE_ID = 'BAACAgIAAxkBAAI-secret-payment-file-id';
const FILE_UNIQUE_ID = 'AgAD-secret-payment-unique-id';

describe('Скриншот оплаты из бота — read-after-write, без file_id в ответе (e2e)', () => {
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

  it('скриншот привязан боту → /me/payments показывает awaiting и hasScreenshot, без file_id', async () => {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const paymentsService = testApp.app.get(PaymentsService, { strict: false });
    const status = await paymentsService.attachScreenshot(
      userId,
      '2026-09',
      { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
      DateTime.utc(),
    );
    expect(status).toBe('awaiting');

    const mine = await request(server()).get('/api/me/payments').set('Cookie', cookie);

    expect(mine.status).toBe(200);
    const row = (mine.body as MyPaymentDto[]).find((p) => p.month === '2026-09');
    expect(row).toMatchObject({ status: 'awaiting', hasScreenshot: true });
    const raw = JSON.stringify(mine.body);
    expect(raw).not.toContain(FILE_ID);
    expect(raw).not.toContain(FILE_UNIQUE_ID);
    expect(raw).not.toContain('fileId');
  });

  it('скриншот на уже paid месяц — статус остаётся paid, скриншот всё равно виден', async () => {
    const { userId, cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик оплативший',
      roles: [],
    });
    const accountant = await createUserWithSession(testApp.app, {
      name: 'Бухгалтер',
      roles: ['accountant'],
    });
    const paymentsService = testApp.app.get(PaymentsService, { strict: false });
    await paymentsService.confirm(
      userId,
      '2026-09',
      {},
      accountant.userId,
      DateTime.utc(),
    );

    const status = await paymentsService.attachScreenshot(
      userId,
      '2026-09',
      { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
      DateTime.utc(),
    );
    expect(status).toBe('paid');

    const mine = await request(server()).get('/api/me/payments').set('Cookie', cookie);
    const row = (mine.body as MyPaymentDto[]).find((p) => p.month === '2026-09');
    expect(row).toMatchObject({ status: 'paid', hasScreenshot: true });
  });
});
