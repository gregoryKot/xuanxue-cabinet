// e2e картинок вариантов ответа (ADR-0035, PLAN §11 слой 4.2): загрузка —
// только штат, раздача — штату всегда, ученику только по снимку своей
// попытки (SECURITY §3). Формат определяется по сигнатуре байтов, не по
// заголовку (сигнатуры отдельно кроет exam-image-upload.spec.ts). Настоящий
// AppModule на MongoMemoryServer — образец exam-items.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ExamAttemptDto, ExamImageDto } from '@xuanxue/shared';
import {
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_NOT_FOUND_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
} from '@xuanxue/shared';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { jpegBytes, pngBytes } from './e2e-support/exam-images-fixtures';

describe('Картинки вариантов ответа (e2e)', () => {
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
    bytes: Buffer,
    contentType: string,
  ): request.Test {
    const req = withCsrf(request(server()).post('/api/exam-images')).set(
      'Content-Type',
      contentType,
    );
    return (cookie ? req.set('Cookie', cookie) : req).send(bytes);
  }

  const helpers = createExamAttemptsTestHelpers(() => testApp);

  it('POST без cookie, но с x-requested-with — 401', async () => {
    const res = await upload(undefined, jpegBytes(), 'image/jpeg');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('POST учеником — 403', async () => {
    const cookie = await helpers.sessionFor([]);
    const res = await upload(cookie, jpegBytes(), 'image/jpeg');
    expect(res.status).toBe(403);
  });

  it('POST учителем JPEG — 201, тело без bytes/_id/__v', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const bytes = jpegBytes();

    const res = await upload(cookie, bytes, 'image/jpeg');

    expect(res.status).toBe(201);
    const dto = res.body as ExamImageDto;
    expect(dto.contentType).toBe('image/jpeg');
    expect(dto.sizeBytes).toBe(bytes.length);
    expect(dto.createdAt).toMatch(/Z$/);
    expect(res.body as Record<string, unknown>).not.toHaveProperty('bytes');
    expect(res.body as Record<string, unknown>).not.toHaveProperty('_id');
    expect(res.body as Record<string, unknown>).not.toHaveProperty('__v');
    // Кэш file_id Telegram (слой 4б.2, ADR-0035) ведёт к файлу у бота — тот
    // же комментарий, что у media_assets.fileId, наружу не отдаём.
    expect(res.body as Record<string, unknown>).not.toHaveProperty('telegramFileId');
  });

  it('формат определяется по байтам, не по заявленному заголовку', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const png = await upload(cookie, pngBytes(), 'image/png');
    expect((png.body as ExamImageDto).contentType).toBe('image/png');

    const mislabelled = await upload(cookie, pngBytes(), 'image/jpeg');
    expect(mislabelled.status).toBe(201);
    expect((mislabelled.body as ExamImageDto).contentType).toBe('image/png');
  });

  it('GET штатом (учитель и помощник) — 200, байты побайтно совпадают, свои заголовки', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const bytes = jpegBytes();
    const uploaded = await upload(teacherCookie, bytes, 'image/jpeg');
    const imageId = (uploaded.body as ExamImageDto).id;

    const res = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', teacherCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);

    const assistantCookie = await sessionCookieFor(testApp.app, ['assistant']);
    const asAssistant = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', assistantCookie);
    expect(asAssistant.status).toBe(200);
  });

  it('GET учеником — 404 без попытки, 200 после снимка в попытке, 404 другому ученику', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const uploaded = await upload(teacherCookie, jpegBytes(), 'image/jpeg');
    const imageId = (uploaded.body as ExamImageDto).id;
    const { examId } = await helpers.createPublishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const before = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', studentCookie);
    expect(before.status).toBe(404);
    expect((before.body as ApiErrorBody).code).toBe('not_found');
    expect((before.body as ApiErrorBody).message).toBe(EXAM_IMAGE_NOT_FOUND_MESSAGE);
    // Отказ не должен уезжать в кеш браузера на год вместе с заголовком
    // успешного ответа: попытка появится позже, и картинка обязана открыться.
    expect(before.headers['cache-control'] ?? '').not.toMatch(/immutable/);

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', studentCookie);
    const attemptId = (started.body as ExamAttemptDto).id;
    const attemptModel = testApp.app.get<Model<ExamAttemptRecord>>(
      getModelToken(ExamAttemptRecord.name),
      { strict: false },
    );
    await attemptModel.updateOne(
      { _id: new Types.ObjectId(attemptId) },
      { $set: { imageIds: [new Types.ObjectId(imageId)] } },
    );

    const after = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', studentCookie);
    expect(after.status).toBe(200);

    const { cookie: strangerCookie } = await createUserWithSession(testApp.app, {
      name: 'Другой ученик',
      roles: [],
    });
    const stranger = await request(server())
      .get(`/api/exam-images/${imageId}`)
      .set('Cookie', strangerCookie);
    expect(stranger.status).toBe(404);
  });

  it('мусорные байты с честным Content-Type — 400 UNSUPPORTED', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const res = await upload(cookie, Buffer.from('not an image'), 'image/jpeg');
    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  });

  it('чужой Content-Type — сырой парсер не включился, тела нет — 400 EMPTY', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const asText = await upload(cookie, jpegBytes(), 'text/plain');
    expect(asText.status).toBe(400);
    expect((asText.body as ApiErrorBody).message).toBe(EXAM_IMAGE_EMPTY_MESSAGE);

    const asJson = await withCsrf(request(server()).post('/api/exam-images'))
      .set('Cookie', cookie)
      .send({});
    expect(asJson.status).toBe(400);
    expect((asJson.body as ApiErrorBody).message).toBe(EXAM_IMAGE_EMPTY_MESSAGE);
  });

  it('больше лимита — 413 в конверте ApiErrorBody, по-русски', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await upload(
      cookie,
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

  it('GET несуществующего и невалидного id — 404; без cookie — 401', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const missing = await request(server())
      .get(`/api/exam-images/${new Types.ObjectId().toString()}`)
      .set('Cookie', cookie);
    expect(missing.status).toBe(404);

    const invalid = await request(server())
      .get('/api/exam-images/abc')
      .set('Cookie', cookie);
    expect(invalid.status).toBe(404);

    const noCookie = await request(server()).get(
      `/api/exam-images/${new Types.ObjectId().toString()}`,
    );
    expect(noCookie.status).toBe(401);
  });
});
