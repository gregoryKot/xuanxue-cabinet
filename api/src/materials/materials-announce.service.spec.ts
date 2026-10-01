// «Сообщить ученикам» при создании материала (ADR-0162) — против настоящей Mongo
// (CLAUDE.md «Тесты»): `announceAt` читаем из базы мимо маппера, потому что
// наружу, в DTO, он не уходит. Отдельный файл, не materials.service.spec.ts:
// тот файл храповик размера пополнять не даёт.
import { Types, type Connection, type Model } from 'mongoose';
import { DateTime } from 'luxon';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { fakeStorageOrphans } from '../test-support/fake-storage-orphans';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsService } from './materials.service';

const AUTHOR_ID = new Types.ObjectId().toString();
const NOW = DateTime.fromISO('2026-10-01T09:00:00Z', { zone: 'utc' });
const BASE = {
  title: 'Ван Пэйшэн',
  url: 'https://example.com/book',
  kind: 'book',
} as const;

describe('MaterialsService: announceAt при создании (ADR-0162)', () => {
  let memory: MemoryMongo;
  let model: Model<MaterialRecord>;
  let service: MaterialsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    const connection: Connection = memory.connection;
    model = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    const classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new MaterialsService(model, classModel, fakeStorageOrphans().service);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function announceAtOf(id: string): Promise<Date | undefined> {
    const raw = await model.collection.findOne<{ announceAt?: Date }>({
      _id: new Types.ObjectId(id),
    });
    return raw?.announceAt;
  }

  it('галочка и доступ «все ученики» — в базе announceAt = now, в ответе его нет', async () => {
    const created = await service.create(
      { ...BASE, notifyStudents: true },
      AUTHOR_ID,
      NOW,
    );

    expect(await announceAtOf(created.id)).toEqual(NOW.toJSDate());
    expect(created).not.toHaveProperty('announceAt');
    expect(created).not.toHaveProperty('notifyStudents');
    // Read-after-write: то же, что вернёт повторное чтение.
    expect(await service.getById(created.id)).not.toHaveProperty('announceAt');
  });

  it('без галочки, с галочкой снятой и со служебным доступом — announceAt нет', async () => {
    const plain = await service.create({ ...BASE }, AUTHOR_ID, NOW);
    const off = await service.create({ ...BASE, notifyStudents: false }, AUTHOR_ID, NOW);
    const staff = await service.create(
      { ...BASE, notifyStudents: true, access: 'staff' },
      AUTHOR_ID,
      NOW,
    );

    for (const { id } of [plain, off, staff]) {
      expect(await announceAtOf(id)).toBeUndefined();
    }
  });

  it('правка названия и доступа announceAt не ставит: перевод staff → all не объявляет', async () => {
    const created = await service.create(
      { ...BASE, notifyStudents: true, access: 'staff' },
      AUTHOR_ID,
      NOW,
    );

    await service.update(created.id, { title: 'Новое название' });
    const opened = await service.update(created.id, { access: 'all' });

    expect(opened.access).toBe('all');
    expect(await announceAtOf(created.id)).toBeUndefined();
  });

  it('правка уже объявленного материала момент не двигает', async () => {
    const created = await service.create(
      { ...BASE, notifyStudents: true },
      AUTHOR_ID,
      NOW,
    );

    await service.update(created.id, { title: 'Опечатка исправлена' });

    expect(await announceAtOf(created.id)).toEqual(NOW.toJSDate());
  });
});
