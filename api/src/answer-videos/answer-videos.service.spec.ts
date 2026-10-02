// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// доступ владельца/штата и статус ready.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotFoundError } from '../common/errors';
import type { FileStoreService, SignedDownload } from '../storage/file-store.service';
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
  // Что сервис попросил у хранилища: параметры скачивания или ничего (просмотр).
  let lastDownload: SignedDownload | undefined;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<AnswerVideoRecord>(
      AnswerVideoRecord.name,
      AnswerVideoSchema,
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
    service = new AnswerVideosService(videoModel, fileStore);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    lastDownload = undefined;
  });

  afterEach(async () => {
    await videoModel.deleteMany({});
  });

  async function makeVideo(
    status: 'uploading' | 'ready',
    contentType?: ExamVideoContentType,
  ): Promise<string> {
    const doc = await videoModel.create({
      ...(contentType ? { contentType } : {}),
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

  describe('скачивание (ADR-0165)', () => {
    it('просмотр — параметров скачивания у ссылки нет', async () => {
      const id = await makeVideo('ready', 'video/mp4');
      await service.signedUrl(id, user(OWNER), NOW);
      expect(lastDownload).toBeUndefined();
    });

    it('владелец скачивает по типу из базы — MOV остаётся MOV', async () => {
      const id = await makeVideo('ready', 'video/quicktime');

      await expect(
        service.signedUrl(id, user(OWNER), NOW, { download: true }),
      ).resolves.toContain('fake-r2.example');
      expect(lastDownload).toEqual({ name: 'video.mov', contentType: 'video/quicktime' });
    });

    it('типа у документа нет — файл video.mp4', async () => {
      const id = await makeVideo('ready');

      await service.signedUrl(id, user(OWNER), NOW, { download: true });

      expect(lastDownload).toEqual({ name: 'video.mp4', contentType: 'video/mp4' });
    });

    it('чужой, не штат — NotFoundError и со скачиванием', async () => {
      const id = await makeVideo('ready', 'video/mp4');

      await expect(
        service.signedUrl(id, user(STRANGER), NOW, { download: true }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(lastDownload).toBeUndefined();
    });
  });

  // ADR-0165: кадр-превью — те же права, что у видео, и тот же 404.
  describe('loadPoster', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7]);

    async function makeWithPoster(
      status: 'uploading' | 'ready',
      withPoster = true,
    ): Promise<string> {
      const doc = await videoModel.create({
        userId: new Types.ObjectId(OWNER),
        attemptId: new Types.ObjectId(),
        itemId: new Types.ObjectId(),
        key: 'answer-videos/p',
        sizeBytes: 100,
        fingerprint: '100:1',
        status,
        ...(withPoster ? { poster: JPEG } : {}),
      });
      return doc._id.toString();
    }

    it('владелец получает те же байты (read-after-write)', async () => {
      const id = await makeWithPoster('ready');

      await expect(service.loadPoster(id, user(OWNER))).resolves.toEqual(JPEG);
    });

    it('штат получает кадр чужого видео', async () => {
      const id = await makeWithPoster('ready');

      await expect(service.loadPoster(id, user(STRANGER, ['teacher']))).resolves.toEqual(
        JPEG,
      );
    });

    it('чужой, не штат — NotFoundError: кадр ученика не отдаётся чужому', async () => {
      const id = await makeWithPoster('ready');

      await expect(service.loadPoster(id, user(STRANGER))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('у видео нет кадра — null, не ошибка (старые видео)', async () => {
      const id = await makeWithPoster('ready', false);

      await expect(service.loadPoster(id, user(OWNER))).resolves.toBeNull();
    });

    it('видео ещё грузится — NotFoundError, даже если кадр уже лежит', async () => {
      const id = await makeWithPoster('uploading');

      await expect(service.loadPoster(id, user(OWNER))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('несуществующий и невалидный id — тот же NotFoundError', async () => {
      await expect(
        service.loadPoster('507f1f77bcf86cd799439011', user(OWNER)),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.loadPoster('не-id', user(OWNER))).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('обычная выдача видео кадр не читает: signedUrl работает, а запись без +poster пуста', async () => {
      const id = await makeWithPoster('ready');

      await expect(service.signedUrl(id, user(OWNER), NOW)).resolves.toContain(
        'fake-r2.example',
      );
      expect(await videoModel.findById(id).lean()).not.toHaveProperty('poster');
    });
  });
});
