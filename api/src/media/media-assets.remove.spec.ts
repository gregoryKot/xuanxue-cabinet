// Снятие записи видео экзамена (ADR-0086) — отдельным файлом, не описанием в
// media-assets.service.spec.ts: тот уже покрывает три пути привязки
// (attachTelegramVideo/addLink/addManual, ADR-0037) и давно перерос
// файл-лимит; remove — четвёртая, самостоятельная механика со своими
// ролью/kind/статусом попытки, и дальше растить общий файл значило бы просто
// откладывать разделение (тот же приём, что exam-media-item.e2e-spec.ts у
// exam-media.e2e-spec.ts). Против настоящей Mongo (mongodb-memory-server, не
// мок — CLAUDE.md «Тесты»): владение попыткой, владение записью, kind и
// статус попытки — ветвления внутри самого запроса, мок их пропустил бы.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { InvalidInputError, NotFoundError } from '../common/errors';
import type { UserLean } from '../users/users.service';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { MediaAssetRecord, MediaAssetSchema } from './media-asset.schema';
import { MediaAssetsService } from './media-assets.service';

const NOW = DateTime.utc(2026, 9, 21, 10, 0, 0);

function studentUser(id: string): UserLean {
  return { id, name: 'Ученик', roles: [], status: 'active' };
}

function staffUser(id: string): UserLean {
  // Помощник учителя правами равен учителю (STAFF_ROLES, shared/auth.ts) —
  // роль здесь не принципиальна, teacher представляет весь штат.
  return { id, name: 'Мария', roles: ['teacher'], status: 'active' };
}

describe('MediaAssetsService.remove (ADR-0086)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let attemptModel: Model<ExamAttemptRecord>;
  let mediaModel: Model<MediaAssetRecord>;
  let service: MediaAssetsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    mediaModel = connection.model<MediaAssetRecord>(
      MediaAssetRecord.name,
      MediaAssetSchema,
    );
    await mediaModel.syncIndexes();
    service = new MediaAssetsService(mediaModel, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await attemptModel.deleteMany({});
    await mediaModel.deleteMany({});
  });

  // examTitle не шифруется здесь нарочно — decrypt() на простой строке
  // возвращает null, и loadAttemptOwnerInfo берёт исходную строку как есть
  // (тот же случай, что «examTitle лежит незашифрованным», media-assets.service.spec.ts);
  // remove() статус и владение читает, содержимое снимка ему не нужно.
  async function seedAttempt(
    userId: string,
    status: 'in_progress' | 'submitted' | 'graded' = 'in_progress',
  ): Promise<string> {
    const created = await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Форма первого уровня',
      userId: new Types.ObjectId(userId),
      attemptNo: 1,
      status,
      blocks: '[]',
      answers: '[]',
      startedAt: NOW.toJSDate(),
    });
    return created._id.toString();
  }

  // Видео из бота заводится напрямую в модели, не через attachTelegramVideo:
  // тот возвращает `null` вместо записи при сбое владения, и разворачивать
  // это в тесте, которому нужна ТОЛЬКО готовая запись kind: 'telegram',
  // лишняя возня — тот же путь, что и у прямого seedAttempt выше.
  async function seedTelegramMedia(attemptId: string, userId: string): Promise<string> {
    const created = await mediaModel.create({
      attemptId: new Types.ObjectId(attemptId),
      userId: new Types.ObjectId(userId),
      kind: 'telegram',
      fileId: 'seed-file-id',
      fileUniqueId: 'seed-unique-id',
      receivedAt: NOW.toJSDate(),
    });
    return created._id.toString();
  }

  const USER_A = new Types.ObjectId().toString();
  const USER_B = new Types.ObjectId().toString();
  const STAFF_ID = new Types.ObjectId().toString();

  it('ученик снимает свою ссылку — пропадает из списка', async () => {
    const attemptId = await seedAttempt(USER_A);
    const link = await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);

    await service.remove(attemptId, link.id, studentUser(USER_A));

    await expect(service.listForAttempt(attemptId)).resolves.toEqual([]);
  });

  it('ученик не снимает чужую запись — NotFoundError, запись остаётся', async () => {
    const attemptId = await seedAttempt(USER_A);
    const link = await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);

    await expect(
      service.remove(attemptId, link.id, studentUser(USER_B)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.listForAttempt(attemptId)).resolves.toHaveLength(1);
  });

  it('ученик не снимает запись из Telegram — видео всё ещё у учителя в чате (ADR-0086)', async () => {
    const attemptId = await seedAttempt(USER_A);
    const mediaId = await seedTelegramMedia(attemptId, USER_A);

    await expect(
      service.remove(attemptId, mediaId, studentUser(USER_A)),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.listForAttempt(attemptId)).resolves.toHaveLength(1);
  });

  it('ученик не снимает ручную отметку учителя', async () => {
    const attemptId = await seedAttempt(USER_A);
    const manual = await service.addManual(attemptId, 'Прислал в WhatsApp', NOW);

    await expect(
      service.remove(attemptId, manual.id, studentUser(USER_A)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('запись другой попытки того же ученика — NotFoundError', async () => {
    const attemptA = await seedAttempt(USER_A);
    const attemptB = await seedAttempt(USER_A);
    const linkA = await service.addLink(attemptA, USER_A, 'https://vk.com/video-a', NOW);

    await expect(
      service.remove(attemptB, linkA.id, studentUser(USER_A)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('несуществующая попытка — NotFoundError', async () => {
    await expect(
      service.remove(
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
        studentUser(USER_A),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mediaId не в форме ObjectId — NotFoundError, не 500', async () => {
    const attemptId = await seedAttempt(USER_A);

    await expect(
      service.remove(attemptId, 'не-id', studentUser(USER_A)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('mediaId похож на ObjectId, но такой записи нет — NotFoundError', async () => {
    const attemptId = await seedAttempt(USER_A);

    await expect(
      service.remove(attemptId, new Types.ObjectId().toString(), studentUser(USER_A)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  describe('штат снимает любую запись попытки, независимо от kind', () => {
    it('ссылку ученика', async () => {
      const attemptId = await seedAttempt(USER_A);
      const link = await service.addLink(
        attemptId,
        USER_A,
        'https://vk.com/video-1',
        NOW,
      );

      await service.remove(attemptId, link.id, staffUser(STAFF_ID));

      await expect(service.listForAttempt(attemptId)).resolves.toEqual([]);
    });

    it('видео из Telegram', async () => {
      const attemptId = await seedAttempt(USER_A);
      const mediaId = await seedTelegramMedia(attemptId, USER_A);

      await service.remove(attemptId, mediaId, staffUser(STAFF_ID));

      await expect(service.listForAttempt(attemptId)).resolves.toEqual([]);
    });

    it('свою же ручную отметку', async () => {
      const attemptId = await seedAttempt(USER_A);
      const manual = await service.addManual(attemptId, 'Прислал в WhatsApp', NOW);

      await service.remove(attemptId, manual.id, staffUser(STAFF_ID));

      await expect(service.listForAttempt(attemptId)).resolves.toEqual([]);
    });
  });

  describe('после graded (ADR-0086)', () => {
    it('ученику — отказ InvalidInputError, запись остаётся', async () => {
      const attemptId = await seedAttempt(USER_A);
      const link = await service.addLink(
        attemptId,
        USER_A,
        'https://vk.com/video-1',
        NOW,
      );
      await attemptModel.updateOne({ _id: attemptId }, { $set: { status: 'graded' } });

      await expect(
        service.remove(attemptId, link.id, studentUser(USER_A)),
      ).rejects.toBeInstanceOf(InvalidInputError);
      await expect(service.listForAttempt(attemptId)).resolves.toHaveLength(1);
    });

    it('штату — можно', async () => {
      const attemptId = await seedAttempt(USER_A);
      const link = await service.addLink(
        attemptId,
        USER_A,
        'https://vk.com/video-1',
        NOW,
      );
      await attemptModel.updateOne({ _id: attemptId }, { $set: { status: 'graded' } });

      await service.remove(attemptId, link.id, staffUser(STAFF_ID));

      await expect(service.listForAttempt(attemptId)).resolves.toEqual([]);
    });
  });
});
