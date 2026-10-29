// e2e «Перегнать видео», подмена файла (ADR-0189): цель с тем же id получает перегнанный
// файл, исходник остаётся в `originalKey`, из списка и сводки видео уходит. Роли трёх
// маршрутов, список и запись кодека — exam-videos-transcode.e2e-spec.ts. R2 не поднимаем:
// FileStoreService и MultipartStoreService подменены фейками с Map вместо сети.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody } from '@xuanxue/shared';
import { ExamVideoRecord } from '../src/exam-videos/exam-video.schema';
import {
  EXAM_VIDEO_ALREADY_REPLACED_MESSAGE,
  EXAM_VIDEO_REPLACE_NOT_H264_MESSAGE,
  EXAM_VIDEO_REPLACE_SELF_MESSAGE,
} from '../src/exam-videos/exam-video-replace.messages';
import { FileStoreService } from '../src/storage/file-store.service';
import { MultipartStoreService } from '../src/storage/multipart-store.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createTranscodeHelpers } from './e2e-support/exam-video-transcode-fixtures';
import { mp4Bytes } from './e2e-support/exam-videos-fixtures';
import { FakeFileStore } from './e2e-support/fake-file-store';
import { FakeMultipartStore } from './e2e-support/fake-multipart-store';
import { sessionCookieFor } from './e2e-support/http';

const UNKNOWN_ID = '507f1f77bcf86cd799439011';
const OLD_BYTES = Buffer.concat([mp4Bytes(60), Buffer.from('hevc-original')]);
const NEW_BYTES = Buffer.concat([mp4Bytes(40), Buffer.from('h264')]);

describe('Перегнать видео: подмена файла (e2e, ADR-0189)', () => {
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

  const { server, upload, postReplace, stats, pendingIds } = createTranscodeHelpers(
    () => testApp,
    store,
    multipart,
  );

  describe('замена файла', () => {
    it('сохранил → нашёл: цель с тем же id получает новый файл, из списка и числа уходит, документ замены исчезает, исходник цел', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, OLD_BYTES, 'hevc');
      const fresh = await upload(teacher, NEW_BYTES, 'avc');
      const oldKey = (await videoModel.findById(old.id).lean())?.key as string;
      const newKey = (await videoModel.findById(fresh.id).lean())?.key as string;
      const before = await stats(teacher);

      const res = await postReplace(teacher, old.id, { replacementId: fresh.id });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: old.id, sizeBytes: NEW_BYTES.length });
      expect(await pendingIds(teacher)).not.toContain(old.id);
      const after = await stats(teacher);
      expect(after.codecPendingCount).toBe(before.codecPendingCount - 1);
      expect(after.count).toBe(before.count - 1);
      expect(await videoModel.exists({ _id: fresh.id })).toBeNull();
      // Ссылка на видео вопроса ведёт на новый объект, байты — новые.
      const link = await request(server())
        .get(`/api/exam-videos/${old.id}`)
        .set('Cookie', teacher)
        .redirects(0);
      expect(link.status).toBe(302);
      expect(link.headers['location']).toContain(newKey);
      const bytes = await request(server())
        .get(`/api/exam-videos/${old.id}/bytes`)
        .set('Cookie', teacher)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        });
      expect(bytes.body as Buffer).toEqual(NEW_BYTES);
      // Исходный файл: ключ записан в документе, объект в хранилище не тронут.
      expect(await videoModel.findById(old.id).lean()).toMatchObject({
        key: newKey,
        originalKey: oldKey,
        originalSizeBytes: OLD_BYTES.length,
        videoCodec: 'avc',
      });
      expect(store.objects.get(oldKey)?.bytes).toEqual(OLD_BYTES);
      expect(store.objects.get(newKey)?.bytes).toEqual(NEW_BYTES);
    });

    it('второй перегон того же видео — 409, исходник первого перегона не перезаписан', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, mp4Bytes(70), 'hevc');
      const first = await upload(teacher, mp4Bytes(71), 'avc');
      const second = await upload(teacher, mp4Bytes(72), 'avc');
      const originalKey = (await videoModel.findById(old.id).lean())?.key;
      await postReplace(teacher, old.id, { replacementId: first.id });

      const res = await postReplace(teacher, old.id, { replacementId: second.id });

      expect(res.status).toBe(409);
      expect((res.body as ApiErrorBody).message).toBe(
        EXAM_VIDEO_ALREADY_REPLACED_MESSAGE,
      );
      expect((await videoModel.findById(old.id).lean())?.originalKey).toBe(originalKey);
      expect(await videoModel.exists({ _id: second.id })).not.toBeNull();
    });

    it('отказы: сама на себя, замена не в H.264, нет замены, нет цели — ничего не меняется', async () => {
      const teacher = await sessionCookieFor(testApp.app, ['teacher']);
      const old = await upload(teacher, mp4Bytes(80), 'hevc');
      const notH264 = await upload(teacher, mp4Bytes(81), 'hevc');

      const self = await postReplace(teacher, old.id, { replacementId: old.id });
      const wrongCodec = await postReplace(teacher, old.id, {
        replacementId: notH264.id,
      });
      const missing = await postReplace(teacher, old.id, { replacementId: UNKNOWN_ID });
      const noBody = await postReplace(teacher, old.id, {});
      const noTarget = await postReplace(teacher, UNKNOWN_ID, {
        replacementId: notH264.id,
      });

      expect(self.status).toBe(400);
      expect((self.body as ApiErrorBody).message).toBe(EXAM_VIDEO_REPLACE_SELF_MESSAGE);
      expect(wrongCodec.status).toBe(400);
      expect((wrongCodec.body as ApiErrorBody).message).toBe(
        EXAM_VIDEO_REPLACE_NOT_H264_MESSAGE,
      );
      expect(missing.status).toBe(400);
      expect(noBody.status).toBe(400);
      expect(noTarget.status).toBe(404);
      expect(await videoModel.findById(old.id).lean()).not.toHaveProperty('originalKey');
      expect(await videoModel.exists({ _id: notH264.id })).not.toBeNull();
    });
  });
});
