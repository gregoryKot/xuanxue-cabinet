// e2e видео вопроса/варианта (ADR-0133, слой 4.2 вслед за картинками):
// раздача — 302 на подписанную ссылку, штату всегда, ученику только по снимку
// своей попытки (SECURITY §3), число для раздела «Экзамены». Сама загрузка —
// только частями (ADR-0165) и проверена в exam-videos-parts.e2e-spec.ts; здесь
// она лишь заводит видео (uploadExamVideo). R2 не поднимаем — FileStoreService
// и MultipartStoreService подменены фейками с Map вместо сети (тот же приём,
// что material-files.e2e-spec.ts). Путь видео через настоящий вопрос/попытку —
// отдельным файлом, exam-item-videos.e2e-spec.ts (тот же приём, что
// exam-images.e2e-spec.ts/exam-item-images.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ExamAttemptDto, ExamVideoStatsDto } from '@xuanxue/shared';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { mp4Bytes, uploadExamVideo } from './e2e-support/exam-videos-fixtures';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';

describe('Раздача видео вопроса/варианта (e2e, ADR-0133)', () => {
  let testApp: TestApp;
  let store: FakeFileStore;

  beforeAll(async () => {
    store = new FakeFileStore();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(store);
      builder.overrideProvider(MultipartStoreService).useValue(new FakeMultipartStore());
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

  const helpers = createExamAttemptsTestHelpers(() => testApp);

  it('GET штатом — 302 на подписанную ссылку, no-store', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const videoId = (await uploadExamVideo(server(), teacherCookie)).id;

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
    const videoId = (await uploadExamVideo(server(), teacherCookie)).id;
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
    await uploadExamVideo(server(), cookie, bytes);

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
