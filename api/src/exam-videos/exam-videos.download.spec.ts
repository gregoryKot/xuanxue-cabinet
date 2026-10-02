// ExamVideosService.signedUrl с `?download=1` (ADR-0165) против настоящей Mongo
// (CLAUDE.md «Тесты»): ссылка на скачивание строится по типу из базы, а право
// на неё проверяется тем же путём, что у просмотра (SECURITY §3).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { ExamVideoContentType } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotFoundError } from '../common/errors';
import { VIEW_VIDEO } from '../common/video-link';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import type { FileStoreService, SignedDownload } from '../storage/file-store.service';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';
import { ExamVideosService } from './exam-videos.service';

const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);

function user(roles: UserLean['roles']): UserLean {
  return { id: new Types.ObjectId().toString(), roles } as UserLean;
}

const TEACHER = user(['teacher']);
const STUDENT = user([]);

describe('ExamVideosService.signedUrl — скачивание', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let service: ExamVideosService;
  let lastDownload: SignedDownload | undefined;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    const fileStore = {
      signedGetUrl: (
        key: string,
        _ttl: number,
        _now: DateTime,
        download?: SignedDownload,
      ) => {
        lastDownload = download;
        return `https://fake-r2.example/${key}`;
      },
    } as unknown as FileStoreService;
    service = new ExamVideosService(
      videoModel,
      attemptModel,
      fileStore,
      {} as StorageOrphansService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    lastDownload = undefined;
  });

  afterEach(async () => {
    await Promise.all([videoModel.deleteMany({}), attemptModel.deleteMany({})]);
  });

  async function makeVideo(contentType: ExamVideoContentType): Promise<string> {
    const doc = await videoModel.create({
      key: 'exam-videos/x',
      contentType,
      sizeBytes: 9,
    });
    return doc._id.toString();
  }

  it('просмотр — параметров скачивания у ссылки нет', async () => {
    const id = await makeVideo('video/mp4');

    await service.signedUrl(id, TEACHER, NOW);
    expect(lastDownload).toBeUndefined();

    await service.signedUrl(id, TEACHER, NOW, VIEW_VIDEO);
    expect(lastDownload).toBeUndefined();
  });

  it.each([
    ['video/mp4', 'video.mp4'],
    ['video/quicktime', 'video.mov'],
    ['video/webm', 'video.webm'],
  ] as const)('скачивание %s штатом — файл %s', async (contentType, name) => {
    const id = await makeVideo(contentType);

    await service.signedUrl(id, TEACHER, NOW, { download: true });

    expect(lastDownload).toEqual({ name, contentType });
  });

  it('ученик со своей попыткой скачивает, как смотрит', async () => {
    const id = await makeVideo('video/quicktime');
    await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Т',
      userId: new Types.ObjectId(STUDENT.id),
      attemptNo: 1,
      startedAt: new Date('2026-10-01T10:00:00.000Z'),
      videoIds: [new Types.ObjectId(id)],
    });

    await expect(
      service.signedUrl(id, STUDENT, NOW, { download: true }),
    ).resolves.toContain('fake-r2.example');
    expect(lastDownload?.name).toBe('video.mov');
  });

  it('чужой ученик — 404 и со скачиванием, ссылка не подписана', async () => {
    const id = await makeVideo('video/mp4');

    await expect(
      service.signedUrl(id, STUDENT, NOW, { download: true }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(lastDownload).toBeUndefined();
  });
});
