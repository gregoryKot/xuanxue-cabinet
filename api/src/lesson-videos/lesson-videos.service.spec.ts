// Доступ к видео записи занятия против настоящей Mongo (mongodb-memory-server, не
// мок — CLAUDE.md «Тесты»): штат видит любое готовое видео, остальные — только то,
// что стоит в записи какого-нибудь занятия (так же видны записи в архиве, ADR-0114).
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import {
  LESSON_VIDEO_NOT_FOUND_MESSAGE,
  LESSON_VIDEO_UPLOADING_MESSAGE,
  type UserRole,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import type { FileStoreService } from '../storage/file-store.service';
import type { UserLean } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { LessonVideoRecord, LessonVideoSchema } from './lesson-video.schema';
import { LessonVideosService } from './lesson-videos.service';

const NOW = DateTime.utc(2026, 10, 10, 12, 0, 0);
const POSTER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function user(roles: UserRole[]): UserLean {
  return { id: new Types.ObjectId().toString(), roles } as unknown as UserLean;
}

describe('LessonVideosService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<LessonVideoRecord>;
  let lessonModel: Model<LessonRecord>;
  let service: LessonVideosService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<LessonVideoRecord>(
      LessonVideoRecord.name,
      LessonVideoSchema,
    );
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    const fileStore = {
      signedGetUrl: (key: string) => `https://r2.example/${key}`,
    } as unknown as FileStoreService;
    service = new LessonVideosService(videoModel, lessonModel, fileStore);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([videoModel.deleteMany({}), lessonModel.deleteMany({})]);
  });

  async function makeVideo(status: 'ready' | 'uploading' = 'ready'): Promise<string> {
    const doc = await videoModel.create({
      key: `lesson-videos/${new Types.ObjectId().toString()}`,
      contentType: 'video/mp4',
      sizeBytes: 10,
      fingerprint: 'test',
      status,
      poster: POSTER,
    });
    return doc._id.toString();
  }

  async function attachToLesson(videoId: string): Promise<void> {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.minus({ days: 1 }).toJSDate(),
      durationMin: 60,
      recordings: [{ title: 'Запись', videoId }],
    });
  }

  describe('signedUrl', () => {
    it('штат получает ссылку на готовое видео, даже не привязанное к записи', async () => {
      const id = await makeVideo();

      const url = await service.signedUrl(id, user(['teacher']), NOW);

      expect(url).toMatch(/^https:\/\/r2\.example\/lesson-videos\//);
    });

    it('ученик получает ссылку, когда видео стоит в записи занятия', async () => {
      const id = await makeVideo();
      await attachToLesson(id);

      await expect(service.signedUrl(id, user([]), NOW)).resolves.toContain('r2.example');
    });

    it('ученик не получает видео, которое не стоит ни в одной записи', async () => {
      const id = await makeVideo();
      await attachToLesson(await makeVideo());

      await expect(service.signedUrl(id, user([]), NOW)).rejects.toThrow(
        new NotFoundError(LESSON_VIDEO_NOT_FOUND_MESSAGE),
      );
    });

    it('видео, которое ещё грузится, не отдаётся даже штату и даже при ссылке из записи', async () => {
      const id = await makeVideo('uploading');
      await attachToLesson(id);

      await expect(service.signedUrl(id, user(['admin']), NOW)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(service.signedUrl(id, user([]), NOW)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('мусорный id — 404, а не ошибка приведения типа', async () => {
      await expect(service.signedUrl('не-id', user(['teacher']), NOW)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('loadPoster', () => {
    it('кадр отдают по тем же правам, что и видео', async () => {
      const id = await makeVideo();
      await attachToLesson(id);

      await expect(service.loadPoster(id, user([]))).resolves.toEqual(POSTER);
      await expect(service.loadPoster(id, user(['teacher']))).resolves.toEqual(POSTER);
    });

    it('у видео без кадра — null, у непривязанного для ученика — 404', async () => {
      const bare = await videoModel.create({
        key: 'lesson-videos/bare',
        contentType: 'video/mp4',
        sizeBytes: 10,
        fingerprint: 'test',
        status: 'ready',
      });
      const detached = await makeVideo();

      await expect(
        service.loadPoster(bare._id.toString(), user(['teacher'])),
      ).resolves.toBeNull();
      await expect(service.loadPoster(detached, user([]))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  describe('assertReady (привязка к записи)', () => {
    it('готовое видео проходит', async () => {
      await expect(service.assertReady(await makeVideo())).resolves.toBeUndefined();
    });

    it('несуществующее и мусорный id — «не найдено»', async () => {
      const missing = new Error(LESSON_VIDEO_NOT_FOUND_MESSAGE);

      await expect(service.assertReady(new Types.ObjectId().toString())).rejects.toThrow(
        missing,
      );
      await expect(service.assertReady('не-id')).rejects.toThrow(missing);
    });

    it('видео, которое ещё грузится, — отдельный текст: надо дождаться', async () => {
      const id = await makeVideo('uploading');

      await expect(service.assertReady(id)).rejects.toThrow(
        new InvalidInputError(LESSON_VIDEO_UPLOADING_MESSAGE),
      );
    });
  });
});
