// e2e: видео вопроса/варианта проходит путь через настоящий вопрос банка
// (ADR-0133, слой 4.2 вслед за картинками, exam-item-images.e2e-spec.ts) —
// файл в R2 у формулировки, ссылка у варианта, чтение обратно тем же
// маршрутом, что и форма конструктора (read-after-write, CLAUDE.md «Тесты»).
// Роли и раздача самого видео уже покрыты exam-videos.e2e-spec.ts — этот файл
// не дублирует их.
import { Types } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ExamItemDto, ExamVideoDto } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { mp4Bytes } from './e2e-support/exam-videos-fixtures';

describe('Видео вопроса/варианта — весь путь (e2e, ADR-0133)', () => {
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

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function uploadVideo(cookie: string): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/exam-videos'))
      .set('Cookie', cookie)
      .set('Content-Type', 'video/mp4')
      .send(mp4Bytes());
    return (res.body as ExamVideoDto).id;
  }

  it('вопрос с видео формулировки (файл R2) — читается обратно', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const videoId = await uploadVideo(teacherCookie);

    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'text',
        prompt: 'Что не так в этом движении?',
        videoId,
        options: [],
      });
    expect(created.status).toBe(201);
    expect((created.body as ExamItemDto).videoId).toBe(videoId);

    const itemId = (created.body as ExamItemDto).id;
    const read = await request(server())
      .get(`/api/exam-items/${itemId}`)
      .set('Cookie', teacherCookie);
    expect((read.body as ExamItemDto).videoId).toBe(videoId);
  });

  it('варианты с видео-ссылкой — читаются обратно', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);

    const created = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'single',
        prompt: 'Какой из двух вариантов выполнен верно?',
        options: [
          { text: 'Первый', correct: true, videoUrl: 'https://youtu.be/dQw4w9WgXcQ' },
          { text: 'Второй', correct: false, videoUrl: 'https://youtu.be/oHg5SJYRHA0' },
        ],
      });

    expect(created.status).toBe(201);
    const options = (created.body as ExamItemDto).options;
    expect(options[0]?.videoUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(options[1]?.videoUrl).toBe('https://youtu.be/oHg5SJYRHA0');
  });

  it('несуществующий videoId в вопросе — 400 InvalidInputError', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'text',
        prompt: 'Вопрос без загруженного видео',
        videoId: new Types.ObjectId().toString(),
        options: [],
      });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('картинка и видео у одного варианта разом — 400', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', teacherCookie)
      .send({
        kind: 'single',
        prompt: 'Вопрос с конфликтом медиа',
        options: [
          {
            text: '',
            correct: true,
            imageId: new Types.ObjectId().toString(),
            videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          },
          { text: 'Второй', correct: false },
        ],
      });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });
});
