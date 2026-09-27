// e2e видео-ответа ученика (ADR-0137) — отказы и роли: неверный Content-Type
// части, выключенное хранилище, превышенный размер, проверенная попытка,
// stats-summary. Happy path/владение — answer-videos.e2e-spec.ts (файл-лимит,
// тот же приём, что exam-attempts-deadline.e2e-spec.ts).
import request from 'supertest';
import type {
  AnswerVideoStatsDto,
  AnswerVideoUploadDto,
  ApiErrorBody,
} from '@xuanxue/shared';
import { ANSWER_VIDEO_LIMITS, FILE_STORAGE_OFF_MESSAGE } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createAnswerVideoTestHelpers,
  partBuffer,
  SMALL_SIZE,
} from './e2e-support/answer-video-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('Видео-ответ ученика — отказы и роли (e2e, ADR-0137)', () => {
  let testApp: TestApp;
  let fileStore: FakeFileStore;
  let multipart: FakeMultipartStore;
  const { startedAttemptWithItems } = createExamMediaTestHelpers(() => testApp);
  const { server, start } = createAnswerVideoTestHelpers(() => testApp);

  beforeAll(async () => {
    fileStore = new FakeFileStore();
    multipart = new FakeMultipartStore();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(fileStore);
      builder.overrideProvider(MultipartStoreService).useValue(multipart);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(() => {
    fileStore.enabled = true;
    multipart.enabled = true;
  });

  it('неверный Content-Type части — сырой парсер не включается, тело не Buffer, 400', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);
    const started = await start(studentCookie, attemptId, videoItemId, SMALL_SIZE);
    const upload = started.body as AnswerVideoUploadDto;

    const res = await withCsrf(
      request(server()).put(`/api/answer-videos/${upload.id}/parts/1`),
    )
      .set('Cookie', studentCookie)
      .set('Content-Type', 'application/json')
      .send(partBuffer(SMALL_SIZE, true).toString('base64'));

    expect(res.status).toBe(400);
  });

  it('хранилище выключено — 503 на старте', async () => {
    fileStore.enabled = false;
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);

    const res = await start(studentCookie, attemptId, videoItemId, SMALL_SIZE);

    expect(res.status).toBe(503);
    expect((res.body as ApiErrorBody).message).toBe(FILE_STORAGE_OFF_MESSAGE);
  });

  it('слишком большой заявленный размер — 400', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);

    const res = await start(
      studentCookie,
      attemptId,
      videoItemId,
      ANSWER_VIDEO_LIMITS.maxBytes + 1,
    );

    expect(res.status).toBe(400);
  });

  it('проверенная (graded) попытка — 409 на старте', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );
    await withCsrf(request(server()).put(`/api/attempts/${attemptId}/grading`))
      .set('Cookie', teacherCookie)
      .send({ outcome: 'passed' });

    const res = await start(studentCookie, attemptId, videoItemId, SMALL_SIZE);

    expect(res.status).toBe(409);
  });

  it('stats-summary — запрещено ученику (403)', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await request(server())
      .get('/api/answer-videos/stats-summary')
      .set('Cookie', studentCookie);

    expect(res.status).toBe(403);
  });

  it('stats-summary — честный ноль на пустой базе, штату доступно', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await request(server())
      .get('/api/answer-videos/stats-summary')
      .set('Cookie', teacherCookie);

    expect(res.status).toBe(200);
    const body = res.body as AnswerVideoStatsDto;
    expect(typeof body.count).toBe('number');
    expect(typeof body.totalBytes).toBe('number');
  });
});
