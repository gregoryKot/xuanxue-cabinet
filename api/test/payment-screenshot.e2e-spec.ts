// e2e загрузки снимка перевода запасным путём (ADR-0050, docs/PLAN.md §15
// слой 2.2): владение — по сессии, месяц в пути только говорит «за какой»
// (SECURITY §3, §4). Сырое тело и лимит — та же механика, что у картинок
// вариантов ответа (exam-images.e2e-spec.ts), поэтому и проверки формата/
// размера повторяют его образец. Байты и file_id наружу не идут ни одним
// полем ответа — ни в MyPaymentDto ученика, ни в строке бухгалтера.
import type { ApiErrorBody, MyPaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import {
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
  PAYMENT_MONTH_INVALID_MESSAGE,
} from '@xuanxue/shared';
import request from 'supertest';
import { PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE } from '../src/payments/payment-month-window';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { jpegBytes } from './e2e-support/exam-images-fixtures';

// Поля, которых в ответе быть не должно ни при каких обстоятельствах —
// ни в MyPaymentDto ученика, ни в строке бухгалтера (SECURITY §4, ADR-0050
// «в ответе нет байтов и file_id»).
const FORBIDDEN_FIELDS = [
  'bytes',
  'screenshotImageId',
  'screenshotFileId',
  'screenshotFileUniqueId',
  '_id',
  '__v',
];

describe('Снимок перевода — загрузка в кабинете (e2e)', () => {
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

  function upload(
    cookie: string | undefined,
    month: string,
    bytes: Buffer,
    contentType: string,
  ): request.Test {
    const req = withCsrf(
      request(server()).post(`/api/me/payments/${month}/screenshot`),
    ).set('Content-Type', contentType);
    return (cookie ? req.set('Cookie', cookie) : req).send(bytes);
  }

  it('POST без cookie, но с x-requested-with — 401', async () => {
    const res = await upload(undefined, '2026-09', jpegBytes(), 'image/jpeg');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик загружает снимок за свой месяц — 201, в теле нет секретных полей', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await upload(cookie, '2026-09', jpegBytes(), 'image/jpeg');

    expect(res.status).toBe(201);
    const dto = res.body as MyPaymentDto;
    expect(dto.month).toBe('2026-09');
    expect(dto.status).toBe('awaiting');
    expect(dto.hasScreenshot).toBe(true);
    for (const field of FORBIDDEN_FIELDS) {
      expect(res.body as Record<string, unknown>).not.toHaveProperty(field);
    }
  });

  it(
    'владение по сессии: месяц в пути не даёт дотянуться до чужой оплаты, ' +
      'read-after-write у себя работает',
    async () => {
      const { cookie: studentACookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик А',
        roles: [],
      });
      const { cookie: studentBCookie } = await createUserWithSession(testApp.app, {
        name: 'Ученик Б',
        roles: [],
      });

      const uploaded = await upload(studentACookie, '2026-09', jpegBytes(), 'image/jpeg');
      expect(uploaded.status).toBe(201);

      // Ученик Б тем же месяцем в пути чужую оплату не видит вовсе.
      const myBBefore = await request(server())
        .get('/api/me/payments')
        .set('Cookie', studentBCookie);
      expect(myBBefore.status).toBe(200);
      expect((myBBefore.body as MyPaymentDto[]).length).toBe(0);

      // Своя загрузка Б за тот же месяц — отдельный документ, не запись А.
      const uploadedB = await upload(
        studentBCookie,
        '2026-09',
        jpegBytes(),
        'image/jpeg',
      );
      expect(uploadedB.status).toBe(201);
      const myBAfter = await request(server())
        .get('/api/me/payments')
        .set('Cookie', studentBCookie);
      const rowB = (myBAfter.body as MyPaymentDto[]).find(
        (row) => row.month === '2026-09',
      );
      expect(rowB?.hasScreenshot).toBe(true);

      // Read-after-write у самого А: тот же месяц, «ждёт подтверждения».
      const myA = await request(server())
        .get('/api/me/payments')
        .set('Cookie', studentACookie);
      expect(myA.status).toBe(200);
      const rowA = (myA.body as MyPaymentDto[]).find((row) => row.month === '2026-09');
      expect(rowA?.status).toBe('awaiting');
      expect(rowA?.hasScreenshot).toBe(true);
    },
  );

  it('бухгалтер видит строку ученика как «ждёт подтверждения», без байтов и file_id', async () => {
    const accountantCookie = await sessionCookieFor(testApp.app, ['accountant']);
    // Имя — уникальное: строку ищем именно этого ученика, а не первую
    // попавшуюся со снимком (месяц 2026-09 трогают и соседние тесты файла,
    // порядок прогона не гарантирован — CLAUDE.md «Детерминизм»).
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик со снимком для бухгалтера',
      roles: [],
    });

    const uploaded = await upload(studentCookie, '2026-09', jpegBytes(), 'image/jpeg');
    expect(uploaded.status).toBe(201);

    const list = await request(server())
      .get('/api/payments?month=2026-09')
      .set('Cookie', accountantCookie);
    expect(list.status).toBe(200);
    const row = (list.body as PaymentsPageDto).rows.find(
      (r) => r.userName === 'Ученик со снимком для бухгалтера',
    );
    expect(row?.hasScreenshot).toBe(true);
    expect(row?.status).toBe('awaiting');
    for (const field of FORBIDDEN_FIELDS) {
      expect(row).not.toHaveProperty(field);
    }
  });

  it('кривой месяц в пути — 400 в общем конверте, INVALID', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await upload(cookie, '2026-13', jpegBytes(), 'image/jpeg');

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(PAYMENT_MONTH_INVALID_MESSAGE);
  });

  // Окно допустимых месяцев — то же, что у ссылки бота (ADR-0050, PLAN §15):
  // месяц приезжает полем пути и подделывается так же, как payload ссылки.
  it('месяц вне окна (2099-12) — 400 в общем конверте', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await upload(cookie, '2099-12', jpegBytes(), 'image/jpeg');

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE);
  });

  it('мусорные байты с честным Content-Type — 400 UNSUPPORTED', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await upload(
      cookie,
      '2026-09',
      Buffer.from('not an image'),
      'image/jpeg',
    );

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  });

  it('чужой Content-Type — сырой парсер не включился, тела нет — 400 EMPTY', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await upload(cookie, '2026-09', jpegBytes(), 'text/plain');

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(EXAM_IMAGE_EMPTY_MESSAGE);
  });

  it('больше лимита — 413 в конверте ApiErrorBody, не 500', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const res = await upload(
      cookie,
      '2026-09',
      jpegBytes(EXAM_IMAGE_LIMITS.maxBytes + 1),
      'image/jpeg',
    );

    expect(res.status).toBe(413);
    const body = res.body as ApiErrorBody;
    expect(body.statusCode).toBe(413);
    expect(body.code).toBe('payload_too_large');
    expect(body.message).toBe(
      'Файл или текст больше допустимого. Уменьшите его и попробуйте ещё раз.',
    );
  });

  it('повтор за тот же месяц не заводит второй абонемент — одна строка после двух загрузок', async () => {
    const cookie = await sessionCookieFor(testApp.app, []);

    const first = await upload(cookie, '2026-10', jpegBytes(), 'image/jpeg');
    expect(first.status).toBe(201);
    const second = await upload(cookie, '2026-10', jpegBytes(), 'image/jpeg');
    expect(second.status).toBe(201);

    const list = await request(server()).get('/api/me/payments').set('Cookie', cookie);
    expect(list.status).toBe(200);
    const rows = (list.body as MyPaymentDto[]).filter((row) => row.month === '2026-10');
    expect(rows.length).toBe(1);
    expect(rows[0]?.hasScreenshot).toBe(true);
  });
});
