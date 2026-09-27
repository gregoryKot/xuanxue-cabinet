// e2e видео вопроса/варианта (ADR-0133, слой 4.2 вслед за картинками):
// загрузка — только штат, раздача — 302 на подписанную ссылку, штату всегда,
// ученику только по снимку своей попытки (SECURITY §3). R2 не поднимаем —
// FileStoreService подменён на фейк с Map вместо сети (тот же приём, что
// material-files.e2e-spec.ts). Путь видео через настоящий вопрос/попытку —
// отдельным файлом, exam-item-videos.e2e-spec.ts (тот же приём, что
// exam-images.e2e-spec.ts/exam-item-images.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type {
  ApiErrorBody,
  ExamAttemptDto,
  ExamVideoDto,
  ExamVideoStatsDto,
} from '@xuanxue/shared';
import {
  EXAM_VIDEO_EMPTY_MESSAGE,
  EXAM_VIDEO_LIMITS,
  EXAM_VIDEO_UNSUPPORTED_MESSAGE,
  FILE_STORAGE_OFF_MESSAGE,
} from '@xuanxue/shared';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { FileStoreService } from '../src/storage/file-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { mp4Bytes } from './e2e-support/exam-videos-fixtures';

describe('Видео вопроса/варианта (e2e, ADR-0133)', () => {
  let testApp: TestApp;
  let store: FakeFileStore;

  beforeAll(async () => {
    store = new FakeFileStore();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(store);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    store.objects.clear();
    store.enabled = true;
    store.failRemove = false;
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function upload(
    cookie: string | undefined,
    bytes: Buffer,
    contentType: string,
  ): request.Test {
    const req = withCsrf(request(server()).post('/api/exam-videos')).set(
      'Content-Type',
      contentType,
    );
    return (cookie ? req.set('Cookie', cookie) : req).send(bytes);
  }

  const helpers = createExamAttemptsTestHelpers(() => testApp);

  it('POST без cookie, но с x-requested-with — 401', async () => {
    const res = await upload(undefined, mp4Bytes(), 'video/mp4');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('POST учеником — 403', async () => {
    const cookie = await helpers.sessionFor([]);
    const res = await upload(cookie, mp4Bytes(), 'video/mp4');
    expect(res.status).toBe(403);
  });

  it('R2 выключен — 503, объект не создаётся', async () => {
    store.enabled = false;
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await upload(cookie, mp4Bytes(), 'video/mp4');

    expect(res.status).toBe(503);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('not_available');
    expect(body.message).toBe(FILE_STORAGE_OFF_MESSAGE);
  });

  it('POST учителем MP4 — 201, тело без key/_id/__v, объект лёг в хранилище', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const bytes = mp4Bytes();

    const res = await upload(cookie, bytes, 'video/mp4');

    expect(res.status).toBe(201);
    const dto = res.body as ExamVideoDto;
    expect(dto.contentType).toBe('video/mp4');
    expect(dto.sizeBytes).toBe(bytes.length);
    expect(dto.createdAt).toMatch(/Z$/);
    expect(res.body as Record<string, unknown>).not.toHaveProperty('key');
    expect(res.body as Record<string, unknown>).not.toHaveProperty('_id');
    expect(res.body as Record<string, unknown>).not.toHaveProperty('__v');
    expect(store.objects.size).toBe(1);
  });

  it('мусорные байты с честным Content-Type — 400 UNSUPPORTED', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const res = await upload(cookie, Buffer.from('not a video'), 'video/mp4');
    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('invalid_input');
    expect(body.message).toBe(EXAM_VIDEO_UNSUPPORTED_MESSAGE);
  });

  it('чужой Content-Type — сырой парсер не включился, тела нет — 400 EMPTY', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const asText = await upload(cookie, mp4Bytes(), 'text/plain');
    expect(asText.status).toBe(400);
    expect((asText.body as ApiErrorBody).message).toBe(EXAM_VIDEO_EMPTY_MESSAGE);
  });

  it('больше лимита — 413 в конверте ApiErrorBody, по-русски', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await upload(
      cookie,
      mp4Bytes(EXAM_VIDEO_LIMITS.maxBytes + 1),
      'video/mp4',
    );

    expect(res.status).toBe(413);
    const body = res.body as ApiErrorBody;
    expect(body.statusCode).toBe(413);
    expect(body.code).toBe('payload_too_large');
  }, 30_000);

  it('GET штатом — 302 на подписанную ссылку, no-store', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const uploaded = await upload(teacherCookie, mp4Bytes(), 'video/mp4');
    const videoId = (uploaded.body as ExamVideoDto).id;

    const res = await request(server())
      .get(`/api/exam-videos/${videoId}`)
      .set('Cookie', teacherCookie)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['location']).toContain('fake-r2.example');
  });

  it('GET учеником — 404 без попытки, 302 после снимка в попытке, 404 другому ученику', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const uploaded = await upload(teacherCookie, mp4Bytes(), 'video/mp4');
    const videoId = (uploaded.body as ExamVideoDto).id;
    const { examId } = await helpers.createPublishedExam(teacherCookie);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const before = await request(server())
      .get(`/api/exam-videos/${videoId}`)
      .set('Cookie', studentCookie)
      .redirects(0);
    expect(before.status).toBe(404);
    expect((before.body as ApiErrorBody).code).toBe('not_found');

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
      { $set: { videoIds: [new Types.ObjectId(videoId)] } },
    );

    const after = await request(server())
      .get(`/api/exam-videos/${videoId}`)
      .set('Cookie', studentCookie)
      .redirects(0);
    expect(after.status).toBe(302);

    const { cookie: strangerCookie } = await createUserWithSession(testApp.app, {
      name: 'Другой ученик',
      roles: [],
    });
    const stranger = await request(server())
      .get(`/api/exam-videos/${videoId}`)
      .set('Cookie', strangerCookie)
      .redirects(0);
    expect(stranger.status).toBe(404);
  });

  it('GET несуществующего и невалидного id — 404; без cookie — 401', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const missing = await request(server())
      .get(`/api/exam-videos/${new Types.ObjectId().toString()}`)
      .set('Cookie', cookie)
      .redirects(0);
    expect(missing.status).toBe(404);

    const invalid = await request(server())
      .get('/api/exam-videos/abc')
      .set('Cookie', cookie)
      .redirects(0);
    expect(invalid.status).toBe(404);

    const noCookie = await request(server()).get(
      `/api/exam-videos/${new Types.ObjectId().toString()}`,
    );
    expect(noCookie.status).toBe(401);
  });

  it('GET stats-summary учителем — count/totalBytes растут на один после загрузки; учеником — 403', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const before = await request(server())
      .get('/api/exam-videos/stats-summary')
      .set('Cookie', cookie);
    const beforeStats = before.body as ExamVideoStatsDto;

    const bytes = mp4Bytes(500);
    await upload(cookie, bytes, 'video/mp4');

    const after = await request(server())
      .get('/api/exam-videos/stats-summary')
      .set('Cookie', cookie);
    const afterStats = after.body as ExamVideoStatsDto;

    expect(afterStats.count).toBe(beforeStats.count + 1);
    expect(afterStats.totalBytes).toBe(beforeStats.totalBytes + bytes.length);

    const asStudent = await helpers.sessionFor([]);
    const forbidden = await request(server())
      .get('/api/exam-videos/stats-summary')
      .set('Cookie', asStudent);
    expect(forbidden.status).toBe(403);
  });
});
