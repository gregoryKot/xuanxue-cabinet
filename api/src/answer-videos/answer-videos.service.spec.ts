// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// доступ владельца/штата и статус ready.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotFoundError } from '../common/errors';
import type { FileStoreService } from '../storage/file-store.service';
import type { UserLean } from '../users/users.service';
import { AnswerVideosService } from './answer-videos.service';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';

const NOW = DateTime.utc(2026, 9, 27, 12, 0, 0);
const OWNER = new Types.ObjectId().toString();
const STRANGER = new Types.ObjectId().toString();

function user(id: string, roles: UserLean['roles'] = []): UserLean {
  return { id, roles } as UserLean;
}

describe('AnswerVideosService.signedUrl', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<AnswerVideoRecord>;
  let service: AnswerVideosService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<AnswerVideoRecord>(
      AnswerVideoRecord.name,
      AnswerVideoSchema,
    );
    const fileStore = {
      signedGetUrl: (key: string) => `https://fake-r2.example/${key}`,
    } as unknown as FileStoreService;
    service = new AnswerVideosService(videoModel, fileStore);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await videoModel.deleteMany({});
  });

  async function makeVideo(status: 'uploading' | 'ready'): Promise<string> {
    const doc = await videoModel.create({
      userId: new Types.ObjectId(OWNER),
      attemptId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      key: 'answer-videos/x',
      sizeBytes: 100,
      fingerprint: '100:1',
      status,
    });
    return doc._id.toString();
  }

  it('несуществующий id — NotFoundError', async () => {
    await expect(
      service.signedUrl('507f1f77bcf86cd799439011', user(OWNER), NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ещё загружается (status: uploading) — NotFoundError, даже владельцу', async () => {
    const id = await makeVideo('uploading');
    await expect(service.signedUrl(id, user(OWNER), NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('владелец — получает подписанную ссылку', async () => {
    const id = await makeVideo('ready');
    await expect(service.signedUrl(id, user(OWNER), NOW)).resolves.toContain(
      'fake-r2.example',
    );
  });

  it('штат — тоже получает ссылку', async () => {
    const id = await makeVideo('ready');
    await expect(
      service.signedUrl(id, user(STRANGER, ['teacher']), NOW),
    ).resolves.toContain('fake-r2.example');
  });

  it('чужой, не штат — NotFoundError (SECURITY §3, не подтверждаем существование)', async () => {
    const id = await makeVideo('ready');
    await expect(service.signedUrl(id, user(STRANGER), NOW)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
