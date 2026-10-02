// e2e скачивания видео-файла, `?download=1` (ADR-0165): тот же редирект на
// подписанную ссылку R2, но с `attachment`. Права те же, что у просмотра
// (SECURITY §3) — чужой ученик получает 404 и со скачиванием; значение
// параметра, кроме `1`, — 400. R2 не поднимаем: FileStoreService подменён
// фейком (e2e-support/fake-file-store.ts), он кладёт те же два параметра
// ответа, что подписывает настоящий адаптер.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ExamVideoContentType } from '@xuanxue/shared';
import { AnswerVideoRecord } from '../src/answer-videos/answer-video.schema';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { sessionCookieFor } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';
import { uploadExamVideo } from './e2e-support/exam-videos-fixtures';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';

const DISPOSITION_PARAM = 'response-content-disposition';

describe('Скачивание видео, ?download=1 (e2e, ADR-0165)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(new FakeFileStore());
      builder.overrideProvider(MultipartStoreService).useValue(new FakeMultipartStore());
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function get(path: string, cookie?: string): request.Test {
    const req = request(server()).get(path).redirects(0);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function disposition(res: request.Response): string | null {
    return new URL(String(res.headers['location'])).searchParams.get(DISPOSITION_PARAM);
  }

  async function uploadVideo(teacherCookie: string): Promise<string> {
    return (await uploadExamVideo(server(), teacherCookie)).id;
  }

  async function giveAttemptWithVideo(userId: string, videoId: string): Promise<void> {
    const model = testApp.app.get<Model<ExamAttemptRecord>>(
      getModelToken(ExamAttemptRecord.name),
      { strict: false },
    );
    await model.create({
      examId: new Types.ObjectId(),
      examTitle: 'Форма',
      userId: new Types.ObjectId(userId),
      attemptNo: 1,
      startedAt: new Date('2026-10-01T10:00:00.000Z'),
      videoIds: [new Types.ObjectId(videoId)],
    });
  }

  async function readyAnswerVideo(
    userId: string,
    contentType?: ExamVideoContentType,
  ): Promise<string> {
    const model = testApp.app.get<Model<AnswerVideoRecord>>(
      getModelToken(AnswerVideoRecord.name),
      { strict: false },
    );
    const doc = await model.create({
      userId: new Types.ObjectId(userId),
      attemptId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      key: `answer-videos/${new Types.ObjectId().toString()}`,
      ...(contentType ? { contentType } : {}),
      sizeBytes: 64,
      fingerprint: '64:1',
      status: 'ready',
    });
    return doc._id.toString();
  }

  describe('видео вопроса — /api/exam-videos/:id', () => {
    it('штат: 302 на ссылку с attachment и video.mp4; без параметра — без attachment', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const id = await uploadVideo(teacher);

      const download = await get(`/api/exam-videos/${id}?download=1`, teacher);
      expect(download.status).toBe(302);
      expect(download.headers['cache-control']).toBe('no-store');
      expect(disposition(download)).toBe("attachment; filename*=UTF-8''video.mp4");

      const view = await get(`/api/exam-videos/${id}`, teacher);
      expect(view.status).toBe(302);
      expect(disposition(view)).toBeNull();
    });

    it('ученик с видео в своей попытке скачивает; другой ученик — 404; без входа — 401', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const id = await uploadVideo(teacher);
      const owner = await createUserWithSession(testApp.app, { name: 'А', roles: [] });
      const stranger = await createUserWithSession(testApp.app, { name: 'Б', roles: [] });
      await giveAttemptWithVideo(owner.userId, id);
      const path = `/api/exam-videos/${id}?download=1`;

      const own = await get(path, owner.cookie);
      expect(own.status).toBe(302);
      expect(disposition(own)).toContain('attachment');

      const foreign = await get(path, stranger.cookie);
      expect(foreign.status).toBe(404);
      expect((foreign.body as ApiErrorBody).code).toBe('not_found');
      expect(foreign.headers['location']).toBeUndefined();

      expect((await get(path)).status).toBe(401);
    });

    it('download=2, пустое значение и чужой параметр — 400, редиректа нет', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const id = await uploadVideo(teacher);

      for (const query of ['download=2', 'download=', 'download=1&download=1', 'x=1']) {
        const res = await get(`/api/exam-videos/${id}?${query}`, teacher);
        expect(res.status).toBe(400);
        expect((res.body as ApiErrorBody).code).toBe('invalid_input');
        expect(res.headers['location']).toBeUndefined();
      }
    });
  });

  describe('видео-ответ — /api/answer-videos/:id', () => {
    it('владелец и штат: 302 на ссылку с attachment и расширением по типу файла', async () => {
      const owner = await createUserWithSession(testApp.app, { name: 'А', roles: [] });
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const id = await readyAnswerVideo(owner.userId, 'video/quicktime');
      const path = `/api/answer-videos/${id}?download=1`;

      const own = await get(path, owner.cookie);
      expect(own.status).toBe(302);
      expect(own.headers['cache-control']).toBe('no-store');
      expect(disposition(own)).toBe("attachment; filename*=UTF-8''video.mov");

      const staff = await get(path, teacher);
      expect(staff.status).toBe(302);
      expect(disposition(staff)).toContain('video.mov');

      const view = await get(`/api/answer-videos/${id}`, owner.cookie);
      expect(disposition(view)).toBeNull();
    });

    it('у документа нет типа — файл video.mp4', async () => {
      const owner = await createUserWithSession(testApp.app, { name: 'А', roles: [] });
      const id = await readyAnswerVideo(owner.userId);

      const res = await get(`/api/answer-videos/${id}?download=1`, owner.cookie);

      expect(res.status).toBe(302);
      expect(disposition(res)).toBe("attachment; filename*=UTF-8''video.mp4");
    });

    it('чужой ученик — 404 и со скачиванием; без входа — 401', async () => {
      const owner = await createUserWithSession(testApp.app, { name: 'А', roles: [] });
      const stranger = await createUserWithSession(testApp.app, { name: 'Б', roles: [] });
      const id = await readyAnswerVideo(owner.userId, 'video/mp4');
      const path = `/api/answer-videos/${id}?download=1`;

      const foreign = await get(path, stranger.cookie);
      expect(foreign.status).toBe(404);
      expect(foreign.headers['location']).toBeUndefined();

      expect((await get(path)).status).toBe(401);
    });

    it('download=2 — 400', async () => {
      const owner = await createUserWithSession(testApp.app, { name: 'А', roles: [] });
      const id = await readyAnswerVideo(owner.userId, 'video/mp4');

      const res = await get(`/api/answer-videos/${id}?download=2`, owner.cookie);

      expect(res.status).toBe(400);
      expect(res.headers['location']).toBeUndefined();
    });
  });
});
