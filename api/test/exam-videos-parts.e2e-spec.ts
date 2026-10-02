// e2e загрузки видео вопроса частями (ADR-0165): старт → части → complete, потом
// видео привязывается к вопросу банка и отдаётся 302. Только штат школы;
// продолжать загрузку может тот, кто её начал (`createdBy`), чужому — 404,
// как несуществующей (SECURITY §3). R2 не поднимаем — FakeFileStore и
// FakeMultipartStore с Map вместо сети (тот же приём, что answer-videos.e2e-spec.ts).
// Прежняя сырая загрузка и роли на ней — exam-videos.e2e-spec.ts.
import request from 'supertest';
import type {
  ApiErrorBody,
  ExamItemDto,
  ExamVideoDto,
  VideoUploadDto,
} from '@xuanxue/shared';
import {
  ANSWER_VIDEO_LIMITS,
  EXAM_VIDEO_LIMITS,
  EXAM_VIDEO_UPLOADING_MESSAGE,
} from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { partBuffer, SMALL_SIZE } from './e2e-support/answer-video-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { createExamVideoPartsHelpers } from './e2e-support/exam-video-parts-fixtures';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

// Больше одной части (8 МиБ + хвост) — чтобы complete собирал несколько частей.
const TWO_PART_SIZE = ANSWER_VIDEO_LIMITS.partBytes + 1000;
const UNKNOWN_ID = '507f1f77bcf86cd799439011';

describe('Видео вопроса частями (e2e, ADR-0165)', () => {
  let testApp: TestApp;
  let fileStore: FakeFileStore;
  let multipart: FakeMultipartStore;

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
  });

  const { server, start, putPart, complete } = createExamVideoPartsHelpers(() => testApp);

  function createItem(cookie: string, videoId: string): request.Test {
    return withCsrf(request(server()).post('/api/exam-items'))
      .set('Cookie', cookie)
      .send({
        kind: 'text',
        prompt: 'Что не так в этом движении?',
        videoId,
        options: [],
      });
  }

  it('весь путь: старт → части → complete → вопрос с видео → GET 302', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);

    const started = await start(teacher, TWO_PART_SIZE);
    expect(started.status).toBe(201);
    const upload = started.body as VideoUploadDto;
    expect(upload).toMatchObject({ partCount: 2, receivedParts: [] });

    // Пока видео грузится, привязать его к вопросу и посмотреть нельзя.
    const early = await createItem(teacher, upload.id);
    expect(early.status).toBe(400);
    expect((early.body as ApiErrorBody).message).toBe(EXAM_VIDEO_UPLOADING_MESSAGE);
    const earlyGet = await request(server())
      .get(`/api/exam-videos/${upload.id}`)
      .set('Cookie', teacher);
    expect(earlyGet.status).toBe(404);

    const part1 = await putPart(
      teacher,
      upload.id,
      1,
      partBuffer(ANSWER_VIDEO_LIMITS.partBytes, true),
    );
    expect(part1.status).toBe(200);
    expect((part1.body as VideoUploadDto).receivedParts).toEqual([1]);
    const part2 = await putPart(teacher, upload.id, 2, partBuffer(1000, false));
    expect((part2.body as VideoUploadDto).receivedParts).toEqual([1, 2]);

    const done = await complete(teacher, upload.id);
    expect(done.status).toBe(201);
    const video = done.body as ExamVideoDto;
    expect(video).toMatchObject({
      id: upload.id,
      contentType: 'video/mp4',
      sizeBytes: TWO_PART_SIZE,
    });
    expect(video.createdAt).toMatch(/Z$/);
    expect(done.body as Record<string, unknown>).not.toHaveProperty('key');
    expect(multipart.objects.size).toBe(1);

    const item = await createItem(teacher, upload.id);
    expect(item.status).toBe(201);
    expect((item.body as ExamItemDto).videoId).toBe(upload.id);

    const get = await request(server())
      .get(`/api/exam-videos/${upload.id}`)
      .set('Cookie', teacher);
    expect(get.status).toBe(302);
    expect(get.headers.location).toContain('fake-r2.example');
  });

  it('повторный complete — тот же ответ, объект в R2 один', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const upload = (await start(teacher, SMALL_SIZE)).body as VideoUploadDto;
    await putPart(teacher, upload.id, 1, partBuffer(SMALL_SIZE, true));

    const first = await complete(teacher, upload.id);
    const again = await complete(teacher, upload.id);

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect(multipart.objects.size).toBe(1);
  });

  it('продолжение: тот же файл тем же учителем возвращает принятые части; другой файл — параллельная загрузка', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const first = (await start(teacher, TWO_PART_SIZE, 'a')).body as VideoUploadDto;
    await putPart(teacher, first.id, 1, partBuffer(ANSWER_VIDEO_LIMITS.partBytes, true));

    const resumed = (await start(teacher, TWO_PART_SIZE, 'a')).body as VideoUploadDto;
    const parallel = (await start(teacher, TWO_PART_SIZE, 'b')).body as VideoUploadDto;

    expect(resumed.id).toBe(first.id);
    expect(resumed.receivedParts).toEqual([1]);
    expect(parallel.id).not.toBe(first.id);
    const firstAgain = (await start(teacher, TWO_PART_SIZE, 'a')).body as VideoUploadDto;
    expect(firstAgain.receivedParts).toEqual([1]);
  });

  describe('роли и владение (SECURITY §3)', () => {
    it('ученик — 403 на старте, части и complete', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const student = await sessionCookieFor(testApp.app, []);
      const upload = (await start(teacher, SMALL_SIZE)).body as VideoUploadDto;

      const results = await Promise.all([
        start(student, SMALL_SIZE),
        putPart(student, upload.id, 1, partBuffer(SMALL_SIZE, true)),
        complete(student, upload.id),
      ]);

      expect(results.map((res) => res.status)).toEqual([403, 403, 403]);
    });

    it('другой учитель — 404 на части и complete, загрузка владельца цела', async () => {
      const owner = await sessionCookieFor(testApp.app, ['teacher']);
      const stranger = await sessionCookieFor(testApp.app, ['teacher']);
      const upload = (await start(owner, SMALL_SIZE)).body as VideoUploadDto;

      const strangerPart = await putPart(
        stranger,
        upload.id,
        1,
        partBuffer(SMALL_SIZE, true),
      );
      const strangerComplete = await complete(stranger, upload.id);

      expect(strangerPart.status).toBe(404);
      expect(strangerComplete.status).toBe(404);
      const ownPart = await putPart(owner, upload.id, 1, partBuffer(SMALL_SIZE, true));
      expect(ownPart.status).toBe(200);
      expect((await complete(owner, upload.id)).status).toBe(201);
      // И готовое видео чужому учителю complete не отдаёт.
      expect((await complete(stranger, upload.id)).status).toBe(404);
    });

    it('несуществующая загрузка — тот же 404, что и чужая', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);

      expect((await putPart(teacher, UNKNOWN_ID, 1, partBuffer(8, true))).status).toBe(
        404,
      );
      expect((await complete(teacher, UNKNOWN_ID)).status).toBe(404);
    });

    it('без сессии — 401 на старте, части и complete', async () => {
      const results = await Promise.all([
        start(undefined, SMALL_SIZE),
        putPart(undefined, UNKNOWN_ID, 1, partBuffer(8, true)),
        complete(undefined, UNKNOWN_ID),
      ]);

      expect(results.map((res) => res.status)).toEqual([401, 401, 401]);
      expect((results[0]?.body as ApiErrorBody).code).toBe('unauthorized');
    });
  });

  describe('отказы', () => {
    it('больше 50 МБ — 400 на старте: бот шлёт этот файл в Telegram целиком', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);

      const res = await start(teacher, EXAM_VIDEO_LIMITS.maxBytes + 1);

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    });

    it('нулевой размер и длинный отпечаток — 400', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);

      expect((await start(teacher, 0)).status).toBe(400);
      expect((await start(teacher, SMALL_SIZE, 'x'.repeat(101))).status).toBe(400);
    });

    it('R2 выключен — 503 на старте, запись не создаётся', async () => {
      fileStore.enabled = false;
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);

      const res = await start(teacher, SMALL_SIZE);

      expect(res.status).toBe(503);
      expect((res.body as ApiErrorBody).code).toBe('not_available');
    });

    it('первая часть не видео — 400, multipart в R2 не открывается', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const upload = (await start(teacher, SMALL_SIZE)).body as VideoUploadDto;

      const res = await putPart(teacher, upload.id, 1, partBuffer(SMALL_SIZE, false));

      expect(res.status).toBe(400);
      expect(multipart.uploads.size).toBe(0);
    });

    it('complete без частей — 409', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const upload = (await start(teacher, SMALL_SIZE)).body as VideoUploadDto;

      expect((await complete(teacher, upload.id)).status).toBe(409);
    });
  });
});
