// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): read-after-write, шифрование секретов, PATCH null → $unset,
// запрет удаления даты из расписания, дефолт title записи.
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { LessonsService } from './lessons.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const FROM = '2026-09-01T00:00:00Z';
const TO = '2026-09-08T00:00:00Z';

describe('LessonsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let service: LessonsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new LessonsService(lessonModel, classModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await lessonModel.deleteMany({});
    await classModel.deleteMany({});
  });

  async function createClass(overrides: Partial<ClassRecord> = {}): Promise<string> {
    const cls = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      ...overrides,
    });
    return cls._id.toString();
  }

  it('create → list: read-after-write, окно видит созданную дату', async () => {
    const classId = await createClass();

    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    const list = await service.list({ from: FROM, to: TO });
    expect(list.map((l) => l.id)).toContain(created.id);
  });

  it('list: фильтр по classId возвращает только даты этого класса', async () => {
    const classA = await createClass({ title: 'А' });
    const classB = await createClass({ title: 'Б' });
    await service.create({ classId: classA, startsAt: '2026-09-03T16:00:00Z' });
    await service.create({ classId: classB, startsAt: '2026-09-04T16:00:00Z' });

    const list = await service.list({ from: FROM, to: TO, classId: classA });

    expect(list).toHaveLength(1);
    expect(list[0]?.classId).toBe(classA);
  });

  it('list: окно шире 4 недель — InvalidInputError', async () => {
    await expect(
      service.list({ from: FROM, to: '2026-10-15T00:00:00Z' }),
    ).rejects.toThrow('4 недел');
  });

  it('list: мусорный classId — NotFoundError, не пустой список', async () => {
    await expect(
      service.list({ from: FROM, to: TO, classId: 'not-an-id' }),
    ).rejects.toThrow('Занятие не найдено');
  });

  it('zoomLinkOverride зашифрован в сырой Mongo, расшифрован в DTO', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    const link = 'https://us02web.zoom.us/j/999';

    const updated = await service.update(created.id, { zoomLinkOverride: link });
    expect(updated.zoomLinkOverride).toBe(link);

    const raw = await lessonModel.findById(created.id).lean();
    expect(raw?.zoomLinkOverride).not.toBe(link);
  });

  it('PATCH note: null → поле исчезает из ответа', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    await service.update(created.id, { note: 'Перенесли' });

    const updated = await service.update(created.id, { note: null });

    expect(updated.note).toBeUndefined();
    expect(JSON.stringify(updated)).not.toContain('note');
  });

  it('PATCH startsAt переносит время, но не создаёт plannedAt', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    const updated = await service.update(created.id, {
      startsAt: '2026-09-04T10:00:00Z',
    });

    expect(updated.startsAt).toBe('2026-09-04T10:00:00.000Z');
    expect(updated.plannedAt).toBeUndefined();
  });

  it('addRecording без url и telegramFileId — InvalidInputError', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await expect(service.addRecording(created.id, {})).rejects.toThrow(
      'ссылку на запись',
    );
  });

  it('addRecording без title — title класса по умолчанию', async () => {
    const classId = await createClass({ title: 'Цигун для начинающих' });
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    const updated = await service.addRecording(created.id, {
      url: 'https://drive.example/rec',
    });

    expect(updated.recordings[0]?.title).toBe('Цигун для начинающих');
  });

  it('remove: дату из расписания (с plannedAt) удалить нельзя — ConflictError', async () => {
    const classId = await createClass();
    const planned = await lessonModel.create({
      classId,
      plannedAt: new Date('2026-09-03T16:00:00Z'),
      startsAt: new Date('2026-09-03T16:00:00Z'),
      durationMin: 60,
    });

    await expect(service.remove(planned._id.toString())).rejects.toThrow(
      'отмените занятие',
    );
    await expect(service.getById(planned._id.toString())).resolves.toBeDefined();
  });

  it('remove: разовую дату удаляет, повторный getById — NotFoundError', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await service.remove(created.id);

    await expect(service.getById(created.id)).rejects.toThrow('не найдена');
  });

  it('remove: несуществующий id — NotFoundError', async () => {
    await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найдена',
    );
  });
});
