// e2e кадра-превью видео-ответа (ADR-0165): кадр — снимок ученика, поэтому права
// те же, что у самого видео: владелец и штат, чужому ученику и не готовому видео
// 404 (SECURITY §3). Загрузка частями и владение — answer-videos.e2e-spec.ts.
import request from 'supertest';
import type { AnswerVideoUploadDto, ApiErrorBody } from '@xuanxue/shared';
import { VIDEO_POSTER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createAnswerVideoTestHelpers,
  partBuffer,
  SMALL_SIZE,
} from './e2e-support/answer-video-fixtures';
import { createExamMediaTestHelpers } from './e2e-support/exam-media-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

describe('Кадр-превью видео-ответа (e2e, ADR-0165)', () => {
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

  function getPoster(cookie: string | undefined, id: string): request.Test {
    const req = request(server()).get(`/api/answer-videos/${id}/poster`);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  /** Ученик с видео, дошедшим до последней части и ждущим complete. */
  async function studentWithUpload(): Promise<{ cookie: string; id: string }> {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const { attemptId, videoItemId } = await startedAttemptWithItems(cookie);
    const upload = (await start(cookie, attemptId, videoItemId, SMALL_SIZE))
      .body as AnswerVideoUploadDto;
    await uploadPart(cookie, upload.id, 1, partBuffer(SMALL_SIZE, true));
    return { cookie, id: upload.id };
  }

  it('кадр из complete отдают владельцу и штату, чужому ученику — 404, без сессии — 401', async () => {
    const { cookie, id } = await studentWithUpload();
    const done = await complete(cookie, id, { poster: JPEG.toString('base64') });
    expect(done.status).toBe(201);
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const { cookie: stranger } = await createUserWithSession(testApp.app, {
      name: 'Чужой',
      roles: [],
    });

    const own = await getPoster(cookie, id);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toContain('image/jpeg');
    expect(own.headers['cache-control']).toBe('private, max-age=86400');
    expect(Buffer.from(own.body as Buffer)).toEqual(JPEG);
    expect(Buffer.from((await getPoster(teacher, id)).body as Buffer)).toEqual(JPEG);
    expect((await getPoster(stranger, id)).status).toBe(404);
    expect((await getPoster(undefined, id)).status).toBe(401);
  });

  it('complete без кадра — видео готово, кадра нет: 404 в общем конверте', async () => {
    const { cookie, id } = await studentWithUpload();
    expect((await complete(cookie, id)).status).toBe(201);

    const res = await getPoster(cookie, id);

    expect(res.status).toBe(404);
    expect((res.body as ApiErrorBody).message).toBe(VIDEO_POSTER_NOT_FOUND_MESSAGE);
  });

  it('повтор complete с кадром у готового видео без кадра — кадр появляется один раз', async () => {
    const { cookie, id } = await studentWithUpload();
    await complete(cookie, id);

    await complete(cookie, id, { poster: JPEG.toString('base64') });
    const other = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1]);
    await complete(cookie, id, { poster: other.toString('base64') });

    expect(Buffer.from((await getPoster(cookie, id)).body as Buffer)).toEqual(JPEG);
  });

  it('неверный кадр — 400, видео остаётся завершаемым без кадра', async () => {
    const { cookie, id } = await studentWithUpload();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString('base64');

    const bad = await complete(cookie, id, { poster: png });

    expect(bad.status).toBe(400);
    expect((bad.body as ApiErrorBody).code).toBe('invalid_input');
    expect((await complete(cookie, id)).status).toBe(201);
  });

  it('видео ещё грузится — кадра не отдаём даже владельцу', async () => {
    const { cookie, id } = await studentWithUpload();

    expect((await getPoster(cookie, id)).status).toBe(404);
  });
});
