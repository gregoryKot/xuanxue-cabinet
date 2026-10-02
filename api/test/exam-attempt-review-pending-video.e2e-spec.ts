// e2e карточки проверки с видео, которое ещё грузится (аудит 2026-10-01 F34):
// ученик нажал «Отправить», пока multipart шёл — учитель открывает
// `GET /attempts/:id/review` и обязан увидеть вопрос в `pendingVideoItemIds`,
// а после `complete` — пустой список и саму запись в `media`. Настоящий
// AppModule на MongoMemoryServer; R2 — фейки, как в answer-videos.e2e-spec.ts.
import request from 'supertest';
import type { AnswerVideoUploadDto, AttemptReviewDto } from '@xuanxue/shared';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createAnswerVideoTestHelpers,
  partBuffer,
  TWO_PART_SIZE,
} from './e2e-support/answer-video-fixtures';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('Карточка проверки: видео ещё грузится (e2e, F34)', () => {
  let testApp: TestApp;
  const { startedAttemptWithItems } = createExamMediaTestHelpers(() => testApp);
  const { server, start, uploadPart, complete } = createAnswerVideoTestHelpers(
    () => testApp,
  );

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(new FakeFileStore());
      builder.overrideProvider(MultipartStoreService).useValue(new FakeMultipartStore());
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  async function review(
    teacherCookie: string,
    attemptId: string,
  ): Promise<AttemptReviewDto> {
    const res = await request(server())
      .get(`/api/attempts/${attemptId}/review`)
      .set('Cookie', teacherCookie);
    expect(res.status).toBe(200);
    return res.body as AttemptReviewDto;
  }

  it('загрузка начата, попытка сдана — вопрос в pendingVideoItemIds; после complete — пусто, видео в media', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(studentCookie);

    const started = await start(studentCookie, attemptId, videoItemId, TWO_PART_SIZE);
    expect(started.status).toBe(201);
    const upload = started.body as AnswerVideoUploadDto;
    await withCsrf(request(server()).post(`/api/attempts/${attemptId}/submit`)).set(
      'Cookie',
      studentCookie,
    );

    const pending = await review(teacherCookie, attemptId);
    expect(pending.pendingVideoItemIds).toEqual([videoItemId]);
    expect(pending.media ?? []).toEqual([]);

    await uploadPart(
      studentCookie,
      upload.id,
      1,
      partBuffer(ANSWER_VIDEO_LIMITS.partBytes, true),
    );
    await uploadPart(studentCookie, upload.id, 2, partBuffer(1000, false));
    const done = await complete(studentCookie, upload.id);
    expect(done.status).toBe(201);

    const ready = await review(teacherCookie, attemptId);
    expect(ready.pendingVideoItemIds).toEqual([]);
    expect(ready.media?.map((item) => item.itemId)).toEqual([videoItemId]);
  });

  it('без загрузок — pendingVideoItemIds пустой, не отсутствует', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId } = await startedAttemptWithItems(studentCookie);

    const res = await review(teacherCookie, attemptId);

    expect(res.pendingVideoItemIds).toEqual([]);
  });

  it('ученику карточка проверки закрыта — 403 и без pendingVideoItemIds', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId } = await startedAttemptWithItems(studentCookie);

    const res = await request(server())
      .get(`/api/attempts/${attemptId}/review`)
      .set('Cookie', studentCookie);

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('pendingVideoItemIds');
  });
});
