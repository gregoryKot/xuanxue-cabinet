// e2e тела части видео вопроса (ADR-0165): сырой парсер включается только для
// `application/octet-stream`, а потолок парсера — одна часть, не файл. Эти два
// отказа раньше проверяла сырая загрузка одним телом (`POST /exam-videos`,
// удалена): чужой Content-Type и тело больше потолка. Остальные отказы и роли —
// exam-videos-parts.e2e-spec.ts. R2 не поднимаем: FakeFileStore и
// FakeMultipartStore с Map вместо сети.
import request from 'supertest';
import type { ApiErrorBody, VideoUploadDto } from '@xuanxue/shared';
import { ANSWER_VIDEO_LIMITS, EXAM_VIDEO_EMPTY_MESSAGE } from '@xuanxue/shared';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { partBuffer, SMALL_SIZE } from './e2e-support/answer-video-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Тело части видео вопроса (e2e, ADR-0165)', () => {
  let testApp: TestApp;
  let multipart: FakeMultipartStore;

  beforeAll(async () => {
    multipart = new FakeMultipartStore();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(new FakeFileStore());
      builder.overrideProvider(MultipartStoreService).useValue(multipart);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  async function startUpload(cookie: string, sizeBytes: number): Promise<string> {
    const res = await withCsrf(
      request(testApp.app.getHttpServer()).post('/api/exam-videos/uploads'),
    )
      .set('Cookie', cookie)
      .send({ sizeBytes, fingerprint: `${sizeBytes}:1` });
    return (res.body as VideoUploadDto).id;
  }

  function putPart(cookie: string, id: string, contentType: string, bytes: Buffer) {
    return withCsrf(
      request(testApp.app.getHttpServer()).put(`/api/exam-videos/${id}/parts/1`),
    )
      .set('Cookie', cookie)
      .set('Content-Type', contentType)
      .send(bytes);
  }

  it('чужой Content-Type — сырой парсер не включился, тела нет — 400', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await startUpload(teacher, SMALL_SIZE);

    const res = await putPart(teacher, id, 'text/plain', partBuffer(SMALL_SIZE, true));

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).message).toBe(EXAM_VIDEO_EMPTY_MESSAGE);
    expect(multipart.uploads.size).toBe(0);
  });

  it('часть больше потолка парсера — 413 в конверте ApiErrorBody', async () => {
    const teacher = await sessionCookieFor(testApp.app, ['teacher']);
    const id = await startUpload(teacher, ANSWER_VIDEO_LIMITS.partBytes + 1000);

    const res = await putPart(
      teacher,
      id,
      'application/octet-stream',
      partBuffer(ANSWER_VIDEO_LIMITS.partBytes + 1, true),
    );

    expect(res.status).toBe(413);
    const body = res.body as ApiErrorBody;
    expect(body.statusCode).toBe(413);
    expect(body.code).toBe('payload_too_large');
  });
});
