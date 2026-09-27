// e2e видео-ответа ученика (ADR-0137): загрузка частями через
// FakeMultipartStore (R2 не поднимаем, тот же приём, что exam-videos.e2e-spec.ts
// с FakeFileStore), владение (SECURITY §3), read-after-write в GET /attempts/:id,
// доступ к готовому файлу владельцу и штату. Ошибки/лимиты/роли —
// answer-videos-errors.e2e-spec.ts (файл-лимит, тот же приём, что
// exam-attempts-deadline.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { AnswerVideoUploadDto, ExamAttemptDto } from '@xuanxue/shared';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createAnswerVideoTestHelpers,
  partBuffer,
  SMALL_SIZE,
  TWO_PART_SIZE,
} from './e2e-support/answer-video-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('Видео-ответ ученика частями (e2e, ADR-0137)', () => {
  let testApp: TestApp;
  let fileStore: FakeFileStore;
  let multipart: FakeMultipartStore;
  const { startedAttemptWithItems } = createExamMediaTestHelpers(() => testApp);
  const { server, start, uploadPart, complete } = createAnswerVideoTestHelpers(
    () => testApp,
  );

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
    fileStore.objects.clear();
    fileStore.enabled = true;
    multipart.enabled = true;
    multipart.uploads.clear();
    multipart.objects.clear();
    multipart.aborted.length = 0;
  });

  it('весь путь: старт → части → complete → media в попытке → GET владельцу и штату', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);

    const started = await start(studentCookie, attemptId, videoItemId, TWO_PART_SIZE);
    expect(started.status).toBe(201);
    const upload = started.body as AnswerVideoUploadDto;
    expect(upload.partCount).toBe(2);
    expect(upload.receivedParts).toEqual([]);

    const part1 = await uploadPart(
      studentCookie,
      upload.id,
      1,
      partBuffer(ANSWER_VIDEO_LIMITS.partBytes, true),
    );
    expect(part1.status).toBe(200);
    expect((part1.body as AnswerVideoUploadDto).receivedParts).toEqual([1]);

    const part2 = await uploadPart(studentCookie, upload.id, 2, partBuffer(1000, false));
    expect(part2.status).toBe(200);
    expect((part2.body as AnswerVideoUploadDto).receivedParts).toEqual([1, 2]);

    const done = await complete(studentCookie, upload.id);
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ kind: 'file', attemptId, itemId: videoItemId });
    const answerVideoId = (done.body as { answerVideoId: string }).answerVideoId;
    expect(answerVideoId).toBeTruthy();

    // Read-after-write — тот же файл виден в GET /attempts/:id владельца.
    const readBack = await request(server())
      .get(`/api/attempts/${attemptId}`)
      .set('Cookie', studentCookie);
    const media = (readBack.body as ExamAttemptDto).media ?? [];
    expect(
      media.some((m) => m.kind === 'file' && m.answerVideoId === answerVideoId),
    ).toBe(true);

    const ownerGet = await request(server())
      .get(`/api/answer-videos/${answerVideoId}`)
      .set('Cookie', studentCookie);
    expect(ownerGet.status).toBe(302);
    expect(ownerGet.headers.location).toContain('fake-r2.example');

    const teacherGet = await request(server())
      .get(`/api/answer-videos/${answerVideoId}`)
      .set('Cookie', teacherCookie);
    expect(teacherGet.status).toBe(302);
  });

  it('resume — старт тем же файлом возвращает уже принятые части', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);
    const first = await start(
      studentCookie,
      attemptId,
      videoItemId,
      TWO_PART_SIZE,
      '100:1700000000',
    );
    const upload = first.body as AnswerVideoUploadDto;
    await uploadPart(
      studentCookie,
      upload.id,
      1,
      partBuffer(ANSWER_VIDEO_LIMITS.partBytes, true),
    );

    const again = await start(
      studentCookie,
      attemptId,
      videoItemId,
      TWO_PART_SIZE,
      '100:1700000000',
    );

    expect(again.status).toBe(201);
    const resumed = again.body as AnswerVideoUploadDto;
    expect(resumed.id).toBe(upload.id);
    expect(resumed.receivedParts).toEqual([1]);
  });

  describe('владение (SECURITY §3)', () => {
    it('чужой attemptId — 404 на старте, части, complete и чтении', async () => {
      const { cookie: ownerCookie } = await createUserWithSession(testApp.app, {
        name: 'Владелец',
        roles: [],
      });
      const { cookie: strangerCookie } = await createUserWithSession(testApp.app, {
        name: 'Чужой',
        roles: [],
      });
      const { attemptId, videoItemId } = await startedAttemptWithItems(ownerCookie);
      const ownStart = await start(ownerCookie, attemptId, videoItemId, SMALL_SIZE);
      const upload = ownStart.body as AnswerVideoUploadDto;

      const strangerStart = await start(
        strangerCookie,
        attemptId,
        videoItemId,
        SMALL_SIZE,
      );
      const strangerPart = await uploadPart(
        strangerCookie,
        upload.id,
        1,
        partBuffer(SMALL_SIZE, true),
      );
      const strangerComplete = await complete(strangerCookie, upload.id);

      expect(strangerStart.status).toBe(404);
      expect(strangerPart.status).toBe(404);
      expect(strangerComplete.status).toBe(404);

      await uploadPart(ownerCookie, upload.id, 1, partBuffer(SMALL_SIZE, true));
      await complete(ownerCookie, upload.id);
      const attemptModel = testApp.app.get<Model<ExamAttemptRecord>>(
        getModelToken(ExamAttemptRecord.name),
      );
      const doc = await attemptModel.findById(attemptId).lean<{ media?: unknown }>();
      expect(doc).not.toBeNull();
      const strangerGet = await request(server())
        .get(`/api/answer-videos/${upload.id}`)
        .set('Cookie', strangerCookie);
      expect(strangerGet.status).toBe(404);
    });

    it('неавторизованный запрос — 401', async () => {
      const res = await withCsrf(
        request(server()).post('/api/attempts/507f1f77bcf86cd799439011/answer-video'),
      ).send({
        itemId: '507f1f77bcf86cd799439012',
        sizeBytes: SMALL_SIZE,
        fingerprint: 'x',
      });
      expect(res.status).toBe(401);
    });
  });
});
