// e2e кадра-превью видео вопроса (ADR-0165): приходит в теле complete, отдаётся
// `GET /exam-videos/:id/poster` с теми же правами, что у самого видео — штат по
// роли, ученик по снимку своей попытки, чужому и не готовому 404 (SECURITY §3).
// Загрузка частями и роли на ней — exam-videos-parts.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ExamAttemptDto, VideoUploadDto } from '@xuanxue/shared';
import {
  VIDEO_POSTER_LIMITS,
  VIDEO_POSTER_NOT_FOUND_MESSAGE,
  VIDEO_POSTER_NOT_JPEG_MESSAGE,
} from '@xuanxue/shared';
import { ExamAttemptRecord } from '../src/exams/exam-attempt.schema';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { partBuffer, SMALL_SIZE } from './e2e-support/answer-video-fixtures';
import { createExamAttemptsTestHelpers } from './e2e-support/exam-attempts-fixtures';
import { createExamVideoPartsHelpers } from './e2e-support/exam-video-parts-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const UNKNOWN_ID = '507f1f77bcf86cd799439011';

describe('Кадр-превью видео вопроса (e2e, ADR-0165)', () => {
  let testApp: TestApp;
  const { server, start, putPart, complete } = createExamVideoPartsHelpers(() => testApp);
  const attempts = createExamAttemptsTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(new FakeFileStore());
      builder.overrideProvider(MultipartStoreService).useValue(new FakeMultipartStore());
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function getPoster(cookie: string | undefined, id: string): request.Test {
    const req = request(server()).get(`/api/exam-videos/${id}/poster`);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  /** Видео, дошедшее до `uploading` с первой частью. */
  async function uploaded(cookie: string): Promise<string> {
    const upload = (await start(cookie, SMALL_SIZE)).body as VideoUploadDto;
    await putPart(cookie, upload.id, 1, partBuffer(SMALL_SIZE, true));
    return upload.id;
  }

  it('кадр из complete отдаётся штату как image/jpeg, те же байты, кеш только для этого человека', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await uploaded(teacher);

    const done = await complete(teacher, id, { poster: JPEG.toString('base64') });
    expect(done.status).toBe(201);

    const res = await getPoster(teacher, id);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=86400');
    expect(Buffer.from(res.body as Buffer)).toEqual(JPEG);
    // Другой штат — тоже: права те же, что у самого видео.
    const other = await sessionCookieFor(testApp.app, ['assistant']);
    expect((await getPoster(other, id)).status).toBe(200);
  });

  it('complete без кадра — видео готово, кадра нет: 404 в общем конверте, не 500', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await uploaded(teacher);
    expect((await complete(teacher, id)).status).toBe(201);

    const res = await getPoster(teacher, id);

    expect(res.status).toBe(404);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('not_found');
    expect(body.message).toBe(VIDEO_POSTER_NOT_FOUND_MESSAGE);
  });

  it('повтор complete с кадром у готового видео без кадра — кадр появляется', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await uploaded(teacher);
    await complete(teacher, id);
    expect((await getPoster(teacher, id)).status).toBe(404);

    const again = await complete(teacher, id, { poster: JPEG.toString('base64') });

    expect(again.status).toBe(201);
    expect(Buffer.from((await getPoster(teacher, id)).body as Buffer)).toEqual(JPEG);
  });

  describe('неверный кадр в complete — 400, видео остаётся завершаемым без кадра', () => {
    it.each([
      ['не JPEG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString('base64')],
      ['не base64', '!!! не кадр !!!'],
      [
        'длиннее потолка',
        Buffer.alloc(VIDEO_POSTER_LIMITS.maxBase64Length + 4, 'A').toString('latin1'),
      ],
    ])('%s', async (_name, poster) => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const id = await uploaded(teacher);

      const bad = await complete(teacher, id, { poster });

      expect(bad.status).toBe(400);
      expect((bad.body as ApiErrorBody).code).toBe('invalid_input');
      expect((await getPoster(teacher, id)).status).toBe(404);
      expect((await complete(teacher, id)).status).toBe(201);
    });

    it('кадр, который не JPEG после разбора base64, — с текстом про JPEG', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const id = await uploaded(teacher);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString('base64');

      const bad = await complete(teacher, id, { poster: png });

      expect((bad.body as ApiErrorBody).message).toBe(VIDEO_POSTER_NOT_JPEG_MESSAGE);
    });
  });

  it('видео ещё грузится — кадра не отдаём (404), хотя видео принадлежит этому штату', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await uploaded(teacher);

    expect((await getPoster(teacher, id)).status).toBe(404);
  });

  it('без сессии — 401; несуществующее и невалидное видео — 404', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);

    expect((await getPoster(undefined, UNKNOWN_ID)).status).toBe(401);
    expect((await getPoster(teacher, UNKNOWN_ID)).status).toBe(404);
    expect((await getPoster(teacher, 'не-id')).status).toBe(404);
  });

  it('ученику — 404 без своей попытки, кадр после снимка видео в попытке, чужому ученику снова 404', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await uploaded(teacher);
    await complete(teacher, id, { poster: JPEG.toString('base64') });
    const { examId } = await attempts.createPublishedExam(teacher);
    const { cookie: student } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { cookie: stranger } = await createUserWithSession(testApp.app, {
      name: 'Другой ученик',
      roles: [],
    });

    expect((await getPoster(student, id)).status).toBe(404);

    const started = await withCsrf(
      request(server()).post(`/api/exams/${examId}/attempts`),
    ).set('Cookie', student);
    const attemptModel = testApp.app.get<Model<ExamAttemptRecord>>(
      getModelToken(ExamAttemptRecord.name),
      { strict: false },
    );
    await attemptModel.updateOne(
      { _id: new Types.ObjectId((started.body as ExamAttemptDto).id) },
      { $set: { videoIds: [new Types.ObjectId(id)] } },
    );

    const own = await getPoster(student, id);
    expect(own.status).toBe(200);
    expect(Buffer.from(own.body as Buffer)).toEqual(JPEG);
    expect((await getPoster(stranger, id)).status).toBe(404);
  });
});
