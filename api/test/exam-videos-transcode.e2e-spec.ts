// e2e «Перегнать видео» (ADR-0189): список старых видео не в H.264, запись кодека,
// подмена файла перегнанным и число в сводке. Все три маршрута — только штату:
// ученику 403, без сессии 401. R2 не поднимаем — FileStoreService и
// MultipartStoreService подменены фейками с Map вместо сети (тот же приём, что
// exam-videos-poster-backfill.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ExamVideoDto } from '@xuanxue/shared';
import { ExamVideoRecord } from '../src/exam-videos/exam-video.schema';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { createTranscodeHelpers } from './e2e-support/exam-video-transcode-fixtures';
import { mp4Bytes } from './e2e-support/exam-videos-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

const UNKNOWN_ID = '507f1f77bcf86cd799439011';
const OLD_BYTES = Buffer.concat([mp4Bytes(60), Buffer.from('hevc-original')]);
const NEW_BYTES = Buffer.concat([mp4Bytes(40), Buffer.from('h264')]);

describe('Перегнать видео (e2e, ADR-0189)', () => {
  let testApp: TestApp;
  const store = new FakeFileStore();
  const multipart = new FakeMultipartStore();
  let videoModel: Model<ExamVideoRecord>;

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(FileStoreService).useValue(store);
      builder.overrideProvider(MultipartStoreService).useValue(multipart);
    });
    videoModel = testApp.app.get(getModelToken(ExamVideoRecord.name), { strict: false });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const { server, upload, list, putCodec, postReplace, stats, pendingIds } =
    createTranscodeHelpers(() => testApp, store, multipart);

  describe('роли', () => {
    it('без сессии — 401 на всех трёх маршрутах', async () => {
      expect((await list()).status).toBe(401);
      expect((await putCodec(undefined, UNKNOWN_ID, { codec: 'avc' })).status).toBe(401);
      expect(
        (await postReplace(undefined, UNKNOWN_ID, { replacementId: UNKNOWN_ID })).status,
      ).toBe(401);
    });

    it('ученику — 403 на всех трёх маршрутах, даже на существующем видео; ничего не меняется', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, OLD_BYTES);
      const fresh = await upload(teacher, NEW_BYTES, 'avc');
      const { cookie: student } = await createUserWithSession(testApp.app, {
        name: 'Ученик',
        roles: [],
      });

      expect((await list(student)).status).toBe(403);
      expect((await putCodec(student, old.id, { codec: 'avc' })).status).toBe(403);
      expect(
        (await postReplace(student, old.id, { replacementId: fresh.id })).status,
      ).toBe(403);
      expect(await pendingIds(teacher)).toContain(old.id);
      expect(await videoModel.exists({ _id: fresh.id })).not.toBeNull();
    });

    it('помощник учителя и админ допущены так же, как учитель', async () => {
      for (const role of ['assistant', 'admin'] as const) {
        const cookie = await sessionCookieFor(testApp.app, [role]);
        expect((await list(cookie)).status).toBe(200);
      }
    });
  });

  describe('список', () => {
    // Литеральный путь обязан обгонять `GET :id` из ExamVideosController: иначе ответ
    // — 404 «Видео не найдено» от хендлера `get` с id='codec-pending'.
    it('GET /exam-videos/codec-pending отвечает списком, а не хендлером :id', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);

      const res = await list(teacher);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('complete с кодеком avc — видео не в списке и не в числе; без кодека и с hevc — в обоих', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const before = await stats(teacher);
      const avc = await upload(teacher, mp4Bytes(50), 'avc');
      const hevc = await upload(teacher, mp4Bytes(51), 'hevc');
      const unknown = await upload(teacher, mp4Bytes(52));

      const pending = await pendingIds(teacher);

      expect(pending).toEqual(expect.arrayContaining([hevc.id, unknown.id]));
      expect(pending).not.toContain(avc.id);
      expect((await stats(teacher)).codecPendingCount).toBe(before.codecPendingCount + 2);
    });

    it('кодек не из списка в complete — 400, видео остаётся незавершённым', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const started = await withCsrf(request(server()).post('/api/exam-videos/uploads'))
        .set('Cookie', teacher)
        .send({ sizeBytes: 30, fingerprint: 'bad-codec' });
      const id = (started.body as { id: string }).id;
      await withCsrf(request(server()).put(`/api/exam-videos/${id}/parts/1`))
        .set('Cookie', teacher)
        .set('Content-Type', 'application/octet-stream')
        .send(mp4Bytes(30));

      const res = await withCsrf(
        request(server()).post(`/api/exam-videos/${id}/complete`),
      )
        .set('Cookie', teacher)
        .send({ codec: 'h265' });

      expect(res.status).toBe(400);
      expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'uploading' });
    });
  });

  describe('кодек старого видео', () => {
    it('сохранил → нашёл: PUT avc выводит видео из списка и из числа', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, mp4Bytes(61));
      const before = await stats(teacher);

      const res = await putCodec(teacher, old.id, { codec: 'avc' });

      expect(res.status).toBe(200);
      expect((res.body as ExamVideoDto).id).toBe(old.id);
      expect(await pendingIds(teacher)).not.toContain(old.id);
      expect((await stats(teacher)).codecPendingCount).toBe(before.codecPendingCount - 1);
    });

    it('PUT hevc оставляет видео в списке и перетирает прежнее значение', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, mp4Bytes(62), 'avc');
      expect(await pendingIds(teacher)).not.toContain(old.id);

      await putCodec(teacher, old.id, { codec: 'hevc' });

      expect(await pendingIds(teacher)).toContain(old.id);
    });

    it('кодек не из списка или тело без него — 400; нет видео или кривой id — 404', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, mp4Bytes(63));

      expect((await putCodec(teacher, old.id, { codec: 'h265' })).status).toBe(400);
      expect((await putCodec(teacher, old.id, {})).status).toBe(400);
      expect((await putCodec(teacher, UNKNOWN_ID, { codec: 'avc' })).status).toBe(404);
      expect((await putCodec(teacher, 'не-id', { codec: 'avc' })).status).toBe(404);
      expect(await pendingIds(teacher)).toContain(old.id);
    });
  });
});
