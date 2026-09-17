// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты», образец media-assets.service.spec.ts): upload шифрует байты,
// load отдаёт их штату по роли или ученику по снимку его попытки
// (SECURITY §3, ADR-0035).
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { binaryToBuffer } from './exam-image.mapper';
import { ExamImageRecord, ExamImageSchema } from './exam-image.schema';
import { ExamImagesService } from './exam-images.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function userLean(overrides: Partial<UserLean> = {}): UserLean {
  return {
    id: new Types.ObjectId().toString(),
    name: 'Т',
    roles: [],
    tz: 'Asia/Jerusalem',
    status: 'active',
    ...overrides,
  };
}

describe('ExamImagesService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let imageModel: Model<ExamImageRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let service: ExamImagesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    imageModel = connection.model<ExamImageRecord>(ExamImageRecord.name, ExamImageSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    await imageModel.syncIndexes();
    service = new ExamImagesService(imageModel, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await imageModel.deleteMany({});
    await attemptModel.deleteMany({});
  });

  async function seedAttempt(userId: string, imageIds: string[] = []): Promise<string> {
    const created = await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Т',
      userId: new Types.ObjectId(userId),
      attemptNo: 1,
      startedAt: new Date('2026-09-12T10:00:00.000Z'),
      imageIds: imageIds.map((id) => new Types.ObjectId(id)),
    });
    return created._id.toString();
  }

  describe('upload', () => {
    it('JPEG — DTO без bytes, sizeBytes и id верные', async () => {
      const dto = await service.upload(JPEG, new Types.ObjectId().toString());

      expect(dto.contentType).toBe('image/jpeg');
      expect(dto.sizeBytes).toBe(JPEG.length);
      expect(typeof dto.id).toBe('string');
      expect(dto).not.toHaveProperty('bytes');
    });

    it('в базе байты зашифрованы (не равны исходным), binaryToBuffer их читает', async () => {
      const dto = await service.upload(JPEG, new Types.ObjectId().toString());

      const raw = await imageModel.findById(dto.id).lean();
      expect(raw).not.toBeNull();
      const rawBytes = binaryToBuffer(raw?.bytes);
      expect(rawBytes.equals(JPEG)).toBe(false);
    });

    it('мусор — InvalidInputError, ничего не создано', async () => {
      await expect(
        service.upload(Buffer.from('мусор'), new Types.ObjectId().toString()),
      ).rejects.toBeInstanceOf(InvalidInputError);
      await expect(imageModel.countDocuments({})).resolves.toBe(0);
    });
  });

  describe('load', () => {
    it.each<UserRole>(['teacher', 'assistant'])(
      'штат (%s) — байты и contentType как при загрузке, без своей попытки',
      async (role) => {
        const dto = await service.upload(JPEG, new Types.ObjectId().toString());

        const loaded = await service.load(dto.id, userLean({ roles: [role] }));

        expect(loaded.bytes.equals(JPEG)).toBe(true);
        expect(loaded.contentType).toBe('image/jpeg');
      },
    );

    it('ученик без попытки с этой картинкой — NotFoundError', async () => {
      const dto = await service.upload(JPEG, new Types.ObjectId().toString());

      await expect(service.load(dto.id, userLean())).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('ученик со своей попыткой, где стоит imageIds — байты доступны', async () => {
      const student = userLean();
      const dto = await service.upload(JPEG, new Types.ObjectId().toString());
      await seedAttempt(student.id, [dto.id]);

      const loaded = await service.load(dto.id, student);

      expect(loaded.bytes.equals(JPEG)).toBe(true);
    });

    it('попытка ЧУЖОГО ученика с этим imageIds — всё равно NotFoundError', async () => {
      const owner = userLean();
      const stranger = userLean();
      const dto = await service.upload(JPEG, new Types.ObjectId().toString());
      await seedAttempt(owner.id, [dto.id]);

      await expect(service.load(dto.id, stranger)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('невалидный id — NotFoundError', async () => {
      await expect(
        service.load('abc', userLean({ roles: ['teacher'] })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('валидный, но несуществующий id — NotFoundError', async () => {
      await expect(
        service.load(new Types.ObjectId().toString(), userLean({ roles: ['teacher'] })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
