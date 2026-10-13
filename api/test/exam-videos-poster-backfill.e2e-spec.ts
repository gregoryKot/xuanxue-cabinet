// e2e дозаполнения кадров старым видео (ADR-0182): список без кадра, запись кадра,
// число в сводке и байты объекта со своего домена с проходом `Range`. Все три
// маршрута — только штату: ученику 403, без сессии 401. R2 не поднимаем —
// FileStoreService и MultipartStoreService подменены фейками с Map вместо сети.
import request from 'supertest';
import type {
  ApiErrorBody,
  ExamVideoDto,
  ExamVideoStatsDto,
  SetVideoPosterInput,
} from '@xuanxue/shared';
import { VIDEO_POSTER_NOT_JPEG_MESSAGE } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { mp4Bytes, uploadExamVideo } from './e2e-support/exam-videos-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const OTHER_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 9, 9, 9, 9]);
const UNKNOWN_ID = '507f1f77bcf86cd799439011';
const VIDEO_SIZE = 64;

describe('Кадры для старых видео вопроса (e2e, ADR-0182)', () => {
  let testApp: TestApp;
  let store: FakeFileStore;
  let multipart: FakeMultipartStore;

  beforeAll(async () => {
    store = new FakeFileStore();
    multipart = new FakeMultipartStore();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(store);
      builder.overrideProvider(MultipartStoreService).useValue(multipart);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();

  /** Видео, загруженное без кадра (как все до ADR-0165); байты объекта лежат и в
   * фейке чтения — `bytes` ходит в FileStoreService, загрузка — в MultipartStore. */
  async function videoWithoutPoster(
    cookie: string,
  ): Promise<{ id: string; bytes: Buffer }> {
    const bytes = Buffer.concat([mp4Bytes(VIDEO_SIZE - 4), Buffer.from([1, 2, 3, 4])]);
    const video = await uploadExamVideo(server(), cookie, bytes);
    for (const [key, object] of multipart.objects) {
      store.objects.set(key, { bytes: object, contentType: video.contentType });
    }
    return { id: video.id, bytes };
  }

  const withoutPoster = (cookie?: string): request.Test => {
    const req = request(server()).get('/api/exam-videos/without-poster');
    return cookie ? req.set('Cookie', cookie) : req;
  };
  const putPoster = (
    cookie: string | undefined,
    id: string,
    body: SetVideoPosterInput,
  ): request.Test => {
    const req = withCsrf(request(server()).put(`/api/exam-videos/${id}/poster`));
    return (cookie ? req.set('Cookie', cookie) : req).send(body);
  };
  const getPoster = (cookie: string, id: string): request.Test =>
    request(server()).get(`/api/exam-videos/${id}/poster`).set('Cookie', cookie);
  const getBytes = (cookie: string | undefined, id: string, range?: string) => {
    let req = request(server())
      .get(`/api/exam-videos/${id}/bytes`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    if (cookie) req = req.set('Cookie', cookie);
    return range ? req.set('Range', range) : req;
  };
  const stats = async (cookie: string): Promise<ExamVideoStatsDto> =>
    (await request(server()).get('/api/exam-videos/stats-summary').set('Cookie', cookie))
      .body as ExamVideoStatsDto;

  describe('роли', () => {
    it('без сессии — 401 на всех трёх маршрутах', async () => {
      expect((await withoutPoster()).status).toBe(401);
      expect((await putPoster(undefined, UNKNOWN_ID, { poster: 'AAAA' })).status).toBe(
        401,
      );
      expect((await getBytes(undefined, UNKNOWN_ID)).status).toBe(401);
    });

    it('ученику — 403 на всех трёх маршрутах, даже на существующем видео', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id } = await videoWithoutPoster(teacher);
      const { cookie: student } = await createUserWithSession(testApp.app, {
        name: 'Ученик',
        roles: [],
      });

      expect((await withoutPoster(student)).status).toBe(403);
      expect(
        (await putPoster(student, id, { poster: JPEG.toString('base64') })).status,
      ).toBe(403);
      expect((await getBytes(student, id)).status).toBe(403);
      // Ученик не смог записать кадр: видео по-прежнему без него.
      expect((await getPoster(teacher, id)).status).toBe(404);
    });
  });

  describe('список и запись кадра', () => {
    it('сохранил → нашёл: видео без кадра в списке и в числе, после PUT — в обоих исчезает', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id } = await videoWithoutPoster(teacher);
      const before = await stats(teacher);
      const listed = (await withoutPoster(teacher)).body as ExamVideoDto[];
      expect(listed.map((video) => video.id)).toContain(id);
      expect(before.withoutPosterCount).toBeGreaterThanOrEqual(1);

      const put = await putPoster(teacher, id, { poster: JPEG.toString('base64') });

      expect(put.status).toBe(200);
      expect((put.body as ExamVideoDto).id).toBe(id);
      const after = (await withoutPoster(teacher)).body as ExamVideoDto[];
      expect(after.map((video) => video.id)).not.toContain(id);
      expect((await stats(teacher)).withoutPosterCount).toBe(
        before.withoutPosterCount - 1,
      );
      const poster = await getPoster(teacher, id);
      expect(poster.status).toBe(200);
      expect(Buffer.from(poster.body as Buffer)).toEqual(JPEG);
    });

    it('второй PUT с другим кадром — 200, но остаётся первый', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['assistant']);
      const { id } = await videoWithoutPoster(teacher);
      await putPoster(teacher, id, { poster: JPEG.toString('base64') });

      const again = await putPoster(teacher, id, {
        poster: OTHER_JPEG.toString('base64'),
      });

      expect(again.status).toBe(200);
      expect(Buffer.from((await getPoster(teacher, id)).body as Buffer)).toEqual(JPEG);
    });

    it('не JPEG — 400 с текстом про JPEG, кадр не записан', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id } = await videoWithoutPoster(teacher);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString('base64');

      const bad = await putPoster(teacher, id, { poster: png });

      expect(bad.status).toBe(400);
      expect((bad.body as ApiErrorBody).message).toBe(VIDEO_POSTER_NOT_JPEG_MESSAGE);
      expect((await getPoster(teacher, id)).status).toBe(404);
    });

    it('тело без кадра — 400; несуществующее и кривое id — 404', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id } = await videoWithoutPoster(teacher);

      expect((await putPoster(teacher, id, {} as SetVideoPosterInput)).status).toBe(400);
      const poster = JPEG.toString('base64');
      expect((await putPoster(teacher, UNKNOWN_ID, { poster })).status).toBe(404);
      expect((await putPoster(teacher, 'не-id', { poster })).status).toBe(404);
    });
  });

  describe('байты со своего домена', () => {
    it('без Range — 200, тип видео, те же байты, что загрузили', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id, bytes } = await videoWithoutPoster(teacher);

      const res = await getBytes(teacher, id);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('video/mp4');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['content-length']).toBe(String(bytes.length));
      expect(res.body as Buffer).toEqual(bytes);
    });

    it('Range: bytes=4-11 — 206, Content-Range и срез', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id, bytes } = await videoWithoutPoster(teacher);

      const res = await getBytes(teacher, id, 'bytes=4-11');

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 4-11/${bytes.length}`);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.body as Buffer).toEqual(bytes.subarray(4, 12));
    });

    it('Range: bytes=-4 — последние четыре байта', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id, bytes } = await videoWithoutPoster(teacher);

      const res = await getBytes(teacher, id, 'bytes=-4');

      expect(res.status).toBe(206);
      expect(res.body as Buffer).toEqual(bytes.subarray(bytes.length - 4));
    });

    it('кривой Range — 400 в общем конверте, не 500 и не проксирование', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const { id } = await videoWithoutPoster(teacher);

      const res = await request(server())
        .get(`/api/exam-videos/${id}/bytes`)
        .set('Cookie', teacher)
        .set('Range', 'abc');

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('несуществующее видео — 404', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);

      expect((await getBytes(teacher, UNKNOWN_ID)).status).toBe(404);
    });
  });
});
