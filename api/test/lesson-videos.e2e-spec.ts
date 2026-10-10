// e2e записи занятия файлом (ADR-0180, PLAN §18 слой 1): штат грузит файл частями,
// привязывает его к записи занятия (`POST /lessons/:id/recording` с `videoId`), а
// любой вошедший смотрит — но только готовое видео, которое стоит в записи.
// Данные школы (ADR-0010): доступ по роли, не по владельцу; продолжать загрузку
// может тот, кто её начал, чужому — 404 (SECURITY §3). R2 не поднимаем:
// FakeFileStore и FakeMultipartStore с Map вместо сети.
import request from 'supertest';
import type {
  ApiErrorBody,
  LessonDto,
  LessonVideoDto,
  MyArchivedLessonDto,
  VideoUploadDto,
} from '@xuanxue/shared';
import {
  ANSWER_VIDEO_LIMITS,
  FILE_STORAGE_OFF_MESSAGE,
  LESSON_VIDEO_LIMITS,
  LESSON_VIDEO_NOT_FOUND_MESSAGE,
  LESSON_VIDEO_UPLOADING_MESSAGE,
} from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { partBuffer, SMALL_SIZE } from './e2e-support/answer-video-fixtures';
import { createExamVideoPartsHelpers } from './e2e-support/exam-video-parts-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor } from './e2e-support/http';
import { createLessonVideoFlow } from './e2e-support/lesson-videos-fixtures';
import { createLessonTestHelpers } from './e2e-support/lessons-fixtures';

const UNKNOWN_ID = '507f1f77bcf86cd799439011';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
const RECORDING_URL = 'https://cloud.example/rec-with-file';

describe('Запись занятия файлом (e2e, ADR-0180)', () => {
  let testApp: TestApp;
  let fileStore: FakeFileStore;
  let multipart: FakeMultipartStore;
  const lessons = createLessonTestHelpers(() => testApp);
  const parts = createExamVideoPartsHelpers(() => testApp, '/api/lesson-videos');
  const { server, start, putPart, complete } = parts;
  const { uploadReady, createPastLesson, addRecording } = createLessonVideoFlow(
    lessons,
    parts,
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
    fileStore.enabled = true;
    multipart.enabled = true;
  });

  afterEach(async () => {
    await lessons.lessonModel().deleteMany({});
    await lessons.classModel().deleteMany({});
    await lessons.broadcastModel().deleteMany({});
  });

  function get(cookie: string | undefined, path: string): request.Test {
    const req = request(server()).get(`/api/lesson-videos/${path}`);
    return cookie ? req.set('Cookie', cookie) : req;
  }

  it('весь путь: загрузка → запись занятия с videoId → архив ученика → 302 на файл', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const student = await sessionCookieFor(testApp.app, []);
    const lessonId = await createPastLesson(teacher);

    const started = await start(teacher, SMALL_SIZE);
    expect(started.status).toBe(201);
    const upload = started.body as VideoUploadDto;
    expect(upload).toMatchObject({ partCount: 1, receivedParts: [] });
    await putPart(teacher, upload.id, 1, partBuffer(SMALL_SIZE, true));
    const done = await complete(teacher, upload.id, { poster: JPEG.toString('base64') });
    expect(done.status).toBe(201);
    expect(done.body as LessonVideoDto).toMatchObject({
      id: upload.id,
      contentType: 'video/mp4',
      sizeBytes: SMALL_SIZE,
    });
    for (const hidden of ['key', '_id', '__v', 'uploadId', 'fingerprint', 'createdBy']) {
      expect(done.body as Record<string, unknown>).not.toHaveProperty(hidden);
    }

    // Пока видео не привязано к записи, ученику оно не видно, штату — видно.
    expect((await get(student, upload.id)).status).toBe(404);
    expect((await get(teacher, upload.id)).status).toBe(302);

    const added = await addRecording(teacher, lessonId, {
      title: 'Запись файлом',
      videoId: upload.id,
    });
    expect(added.status).toBe(201);
    expect((added.body as LessonDto).recordings[0]).toMatchObject({
      title: 'Запись файлом',
      videoId: upload.id,
    });

    // Read-after-write: то, что записали, ученик видит в архиве.
    const archive = await request(server())
      .get('/api/me/lessons/archive')
      .set('Cookie', student);
    expect(archive.status).toBe(200);
    expect((archive.body as MyArchivedLessonDto[])[0]?.recordings).toEqual([
      { title: 'Запись файлом', videoId: upload.id },
    ]);

    const play = await get(student, upload.id);
    expect(play.status).toBe(302);
    expect(play.headers.location).toContain('fake-r2.example');
    const poster = await get(student, `${upload.id}/poster`);
    expect(poster.status).toBe(200);
    expect(poster.headers['content-type']).toContain('image/jpeg');
  });

  it('файл и ссылка — одна запись; повтор того же videoId не плодит вторую, рассылка по videoId', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const lessonId = await createPastLesson(teacher);
    const videoId = await uploadReady(teacher);
    const body = { title: 'Запись', url: RECORDING_URL, videoId };

    const first = await addRecording(teacher, lessonId, body);
    const again = await addRecording(teacher, lessonId, body);

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect((again.body as LessonDto).recordings).toHaveLength(1);
    expect((again.body as LessonDto).recordings[0]).toMatchObject({
      url: RECORDING_URL,
      videoId,
    });
    // Ключ идемпотентности рассылки — файл, а не ссылка; второго поста нет.
    const posts = await lessons.broadcastModel().find({ lessonId, kind: 'recording' });
    expect(posts.map((post) => post.recordingKey)).toEqual([videoId]);
  });

  // ADR-0180, PLAN §18 слой 2: рассылку записи только с файлом запустят публикации.
  // Пост сейчас вышел бы с пустой {ссылка} и без видео, поэтому строки рассылки нет.
  it('запись только с файлом сохраняется, но рассылку не создаёт', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const lessonId = await createPastLesson(teacher);
    const videoId = await uploadReady(teacher);

    const res = await addRecording(teacher, lessonId, { videoId });

    expect(res.status).toBe(201);
    expect((res.body as LessonDto).recordings[0]?.videoId).toBe(videoId);
    await expect(lessons.broadcastModel().countDocuments({ lessonId })).resolves.toBe(0);
  });

  it('привязать можно только готовое существующее видео', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const lessonId = await createPastLesson(teacher);
    const uploading = (await start(teacher, SMALL_SIZE)).body as VideoUploadDto;

    const results = await Promise.all([
      addRecording(teacher, lessonId, { videoId: UNKNOWN_ID }),
      addRecording(teacher, lessonId, { videoId: uploading.id }),
      addRecording(teacher, lessonId, { videoId: 'не-идентификатор' }),
    ]);

    expect(results.map((res) => res.status)).toEqual([400, 400, 400]);
    expect((results[0]?.body as ApiErrorBody).message).toBe(
      LESSON_VIDEO_NOT_FOUND_MESSAGE,
    );
    expect((results[1]?.body as ApiErrorBody).message).toBe(
      LESSON_VIDEO_UPLOADING_MESSAGE,
    );
    const lesson = await lessons.lessonModel().findById(lessonId).lean();
    expect(lesson?.recordings).toHaveLength(0);
  });

  it('потолок — 2000 МБ: ровно он принимается (250 частей), на байт больше — 400', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);

    const atLimit = await start(teacher, LESSON_VIDEO_LIMITS.maxBytes);
    const over = await start(teacher, LESSON_VIDEO_LIMITS.maxBytes + 1);

    expect(atLimit.status).toBe(201);
    expect((atLimit.body as VideoUploadDto).partCount).toBe(
      Math.ceil(LESSON_VIDEO_LIMITS.maxBytes / ANSWER_VIDEO_LIMITS.partBytes),
    );
    expect(over.status).toBe(400);
  });

  it('R2 не подключён — старт отвечает 503 с советом', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    fileStore.enabled = false;

    const res = await start(teacher, SMALL_SIZE);

    expect(res.status).toBe(503);
    expect((res.body as ApiErrorBody).message).toBe(FILE_STORAGE_OFF_MESSAGE);
  });

  describe('роли и владение (SECURITY §3)', () => {
    it('без сессии — 401 на всех маршрутах', async () => {
      const uploads = await Promise.all([
        start(undefined, SMALL_SIZE),
        putPart(undefined, UNKNOWN_ID, 1, partBuffer(8, true)),
        complete(undefined, UNKNOWN_ID),
      ]);
      const reads = [
        await get(undefined, UNKNOWN_ID),
        await get(undefined, `${UNKNOWN_ID}/poster`),
      ];

      expect([...uploads, ...reads].map((res) => res.status)).toEqual([
        401, 401, 401, 401, 401,
      ]);
    });

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

    it('помощник и админ грузят так же, как учитель', async () => {
      const assistant = await sessionCookieFor(testApp.app, ['assistant']);
      const admin = await sessionCookieFor(testApp.app, ['admin']);

      const results = await Promise.all([
        start(assistant, SMALL_SIZE),
        start(admin, SMALL_SIZE, 'другой-файл'),
      ]);

      expect(results.map((res) => res.status)).toEqual([201, 201]);
    });

    it('чужую загрузку другой учитель не продолжает: 404 на части и complete', async () => {
      const owner = await sessionCookieFor(testApp.app, ['teacher']);
      const stranger = await sessionCookieFor(testApp.app, ['teacher']);
      const upload = (await start(owner, SMALL_SIZE)).body as VideoUploadDto;

      const part = await putPart(stranger, upload.id, 1, partBuffer(SMALL_SIZE, true));
      const done = await complete(stranger, upload.id);

      expect([part.status, done.status]).toEqual([404, 404]);
      expect((part.body as ApiErrorBody).message).toBe(LESSON_VIDEO_NOT_FOUND_MESSAGE);
      // Загрузка владельца цела и завершается им.
      await putPart(owner, upload.id, 1, partBuffer(SMALL_SIZE, true));
      expect((await complete(owner, upload.id)).status).toBe(201);
    });

    it('видео, которое ещё грузится, не отдаётся никому; несуществующий id — тот же 404', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const student = await sessionCookieFor(testApp.app, []);
      const upload = (await start(teacher, SMALL_SIZE)).body as VideoUploadDto;

      const results = await Promise.all([
        get(teacher, upload.id),
        get(student, upload.id),
        get(teacher, UNKNOWN_ID),
        get(student, `${UNKNOWN_ID}/poster`),
        get(teacher, 'не-идентификатор'),
      ]);

      expect(results.map((res) => res.status)).toEqual([404, 404, 404, 404, 404]);
    });

    it('готовое, но не привязанное к записи видео ученик не открывает, и кадр тоже', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const student = await sessionCookieFor(testApp.app, []);
      const videoId = await uploadReady(teacher, JPEG);

      const results = await Promise.all([
        get(student, videoId),
        get(student, `${videoId}/poster`),
        get(teacher, `${videoId}/poster`),
      ]);

      expect(results.map((res) => res.status)).toEqual([404, 404, 200]);
    });
  });
});
