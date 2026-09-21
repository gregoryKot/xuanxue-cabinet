// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): read-after-write, шифрование секретов, PATCH null → $unset,
// запрет удаления даты из расписания, дефолт title записи. addRecording
// зовёт RecordingBroadcastService.ensureForRecording всегда (идемпотентность
// самой рассылки — на уникальном индексе (lessonId, recordingKey), не здесь)
// — фейк считает вызовы и запоминает переданный url, сама рассылка
// (broadcast+доставки, cancelled) проверена в recording-broadcast.service.spec.ts.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { LIST_LIMIT_DEFAULT } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import type { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import type { RecordingBroadcastService } from '../broadcasts/recording-broadcast.service';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { MaterialRecord, MaterialSchema } from '../materials/material.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { LessonsService } from './lessons.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const FROM = '2026-09-01T00:00:00Z';
const TO = '2026-09-08T00:00:00Z';
const NOW = DateTime.fromISO('2026-09-03T12:00:00Z', { zone: 'utc' });

function fakeRecordingBroadcast(): RecordingBroadcastService & {
  calls: number;
  urls: (string | undefined)[];
} {
  const fake = {
    calls: 0,
    urls: [] as (string | undefined)[],
    ensureForRecording(_lessonId: unknown, recording: { url?: string }): Promise<void> {
      fake.calls += 1;
      fake.urls.push(recording.url);
      return Promise.resolve();
    },
  };
  return fake as unknown as RecordingBroadcastService & {
    calls: number;
    urls: (string | undefined)[];
  };
}

// Механику самой пересборки (текст, момент отправки, гварды раннера) проверяет
// lesson-link-rebuild.service.spec.ts против настоящей Mongo — здесь важен
// только факт вызова: startsAt в PATCH зовёт rebuild с id и now, без startsAt
// — не зовёт (та же граница ответственности, что у fakeRecordingBroadcast выше).
function fakeLessonLinkRebuild(): LessonLinkRebuildService & {
  calls: { lessonId: string; now: DateTime }[];
} {
  const fake = {
    calls: [] as { lessonId: string; now: DateTime }[],
    rebuild(lessonId: Types.ObjectId, now: DateTime): Promise<boolean> {
      fake.calls.push({ lessonId: lessonId.toString(), now });
      return Promise.resolve(true);
    },
  };
  return fake as unknown as LessonLinkRebuildService & {
    calls: { lessonId: string; now: DateTime }[];
  };
}

describe('LessonsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let userModel: Model<UserRecord>;
  let materialModel: Model<MaterialRecord>;
  let recordingBroadcast: RecordingBroadcastService & {
    calls: number;
    urls: (string | undefined)[];
  };
  let lessonLinkRebuild: LessonLinkRebuildService & {
    calls: { lessonId: string; now: DateTime }[];
  };
  let service: LessonsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    materialModel = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    recordingBroadcast = fakeRecordingBroadcast();
    lessonLinkRebuild = fakeLessonLinkRebuild();
    service = new LessonsService(
      lessonModel,
      classModel,
      recordingBroadcast,
      lessonLinkRebuild,
      broadcastModel,
      userModel,
      materialModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    recordingBroadcast.calls = 0;
    recordingBroadcast.urls = [];
    lessonLinkRebuild.calls = [];
    await lessonModel.deleteMany({});
    await classModel.deleteMany({});
    await broadcastModel.deleteMany({});
    await userModel.deleteMany({});
    await materialModel.deleteMany({});
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

  it('list: дата ровно в to не попадает — граница исключающая', async () => {
    const classId = await createClass();
    await service.create({ classId, startsAt: TO });

    const list = await service.list({ from: FROM, to: TO });

    expect(list).toHaveLength(0);
  });

  it('list: без limit отдаёт все совпадения', async () => {
    const classId = await createClass();
    await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    await service.create({ classId, startsAt: '2026-09-04T16:00:00Z' });

    const list = await service.list({ from: FROM, to: TO });

    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('list: занятие с рассылкой ссылки — поле broadcast со статусом, без рассылки — поле отсутствует', async () => {
    const classId = await createClass();
    const withBroadcast = await service.create({
      classId,
      startsAt: '2026-09-03T16:00:00Z',
    });
    const withoutBroadcast = await service.create({
      classId,
      startsAt: '2026-09-04T16:00:00Z',
    });
    await broadcastModel.create({
      kind: 'lesson_link',
      lessonId: withBroadcast.id,
      text: 'Ссылка на занятие',
      scheduledAt: new Date('2026-09-03T15:30:00Z'),
      channelIds: [],
      status: 'sent',
    });

    const list = await service.list({ from: FROM, to: TO });

    const withDto = list.find((l) => l.id === withBroadcast.id);
    const withoutDto = list.find((l) => l.id === withoutBroadcast.id);
    expect(withDto?.broadcast).toEqual({ status: 'sent', kind: 'lesson_link' });
    expect(withoutDto?.broadcast).toBeUndefined();
  });

  it('zoomLinkOverride зашифрован в сырой Mongo, расшифрован в DTO', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    const link = 'https://us02web.zoom.us/j/999';

    const updated = await service.update(created.id, { zoomLinkOverride: link }, NOW);
    expect(updated.zoomLinkOverride).toBe(link);

    const raw = await lessonModel.findById(created.id).lean();
    expect(raw?.zoomLinkOverride).not.toBe(link);
  });

  it('PATCH note: null → поле исчезает из ответа', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    await service.update(created.id, { note: 'Перенесли' }, NOW);

    const updated = await service.update(created.id, { note: null }, NOW);

    expect(updated.note).toBeUndefined();
    expect(JSON.stringify(updated)).not.toContain('note');
  });

  it('PATCH leaderId с id учителя — сохраняется, попадает в DTO (аудит В4)', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    const teacher = await userModel.create({ name: 'Дмитрий', roles: ['teacher'] });

    const updated = await service.update(
      created.id,
      { leaderId: teacher._id.toString() },
      NOW,
    );

    expect(updated.leaderId).toBe(teacher._id.toString());
  });

  it('PATCH leaderId с id ученика — InvalidInputError, дата занятия не меняется', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    const student = await userModel.create({ name: 'Гриша', roles: [] });

    await expect(
      service.update(created.id, { leaderId: student._id.toString() }, NOW),
    ).rejects.toThrow('не найден среди учителей');
    await expect(service.getById(created.id)).resolves.toMatchObject({
      leaderId: undefined,
    });
  });

  it('PATCH leaderId: null — ведущий снимается без проверки', async () => {
    const classId = await createClass();
    const teacher = await userModel.create({ name: 'Дмитрий', roles: ['teacher'] });
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    await service.update(created.id, { leaderId: teacher._id.toString() }, NOW);

    const updated = await service.update(created.id, { leaderId: null }, NOW);

    expect(updated.leaderId).toBeUndefined();
  });

  it('PATCH startsAt переносит время, но не создаёт plannedAt', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    const updated = await service.update(
      created.id,
      { startsAt: '2026-09-04T10:00:00Z' },
      NOW,
    );

    expect(updated.startsAt).toBe('2026-09-04T10:00:00.000Z');
    expect(updated.plannedAt).toBeUndefined();
  });

  it('PATCH startsAt зовёт LessonLinkRebuildService.rebuild с этим занятием и now (ADR-0054)', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await service.update(created.id, { startsAt: '2026-09-04T10:00:00Z' }, NOW);

    expect(lessonLinkRebuild.calls).toEqual([{ lessonId: created.id, now: NOW }]);
  });

  it('PATCH без startsAt (например, только тема) rebuild не зовёт — своя пересборка вызывающего кода остаётся единственной', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await service.update(created.id, { topic: 'Новая тема' }, NOW);

    expect(lessonLinkRebuild.calls).toEqual([]);
  });

  it('addRecording без url и telegramFileId — InvalidInputError', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await expect(service.addRecording(created.id, {}, NOW)).rejects.toThrow(
      'ссылку на запись',
    );
  });

  it('addRecording: url мимо DTO (как шлёт бот) с неверным протоколом — InvalidInputError', async () => {
    // Бот собирает вход из текста сообщения (recording-source.ts), не через
    // AddRecordingDto/class-validator — addRecording обязан проверить сам
    // (lessons.recording.ts, assertValidRecordingUrl).
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await expect(
      service.addRecording(created.id, { url: 'ftp://example.com/rec' }, NOW),
    ).rejects.toThrow('ссылку на запись');
  });

  it('addRecording без title — title класса по умолчанию', async () => {
    const classId = await createClass({ title: 'Цигун для начинающих' });
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    const updated = await service.addRecording(
      created.id,
      { url: 'https://drive.example/rec' },
      NOW,
    );

    expect(updated.recordings[0]?.title).toBe('Цигун для начинающих');
  });

  it('addRecording: класс удалён — title записи пустая строка', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    await classModel.deleteOne({ _id: classId });

    const updated = await service.addRecording(
      created.id,
      { url: 'https://drive.example/rec' },
      NOW,
    );

    expect(updated.recordings[0]?.title).toBe('');
  });

  it('addRecording: повтор того же url не плодит вторую запись, но рассылку зовёт снова тем же url; другой url — плодит запись', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    const url = 'https://drive.example/rec';

    await service.addRecording(created.id, { url }, NOW);
    const afterRepeat = await service.addRecording(created.id, { url }, NOW);
    expect(afterRepeat.recordings).toHaveLength(1);
    // Идемпотентность самой рассылки — не здесь, а в уникальном индексе
    // (lessonId, recordingKey): сервис зовётся на каждый addRecording, чтобы
    // достроить недостающие доставки, если первый вызов упал раньше них.
    expect(recordingBroadcast.calls).toBe(2);
    expect(recordingBroadcast.urls).toEqual([url, url]);

    const afterOther = await service.addRecording(
      created.id,
      { url: 'https://drive.example/rec-2' },
      NOW,
    );
    expect(afterOther.recordings).toHaveLength(2);
    expect(recordingBroadcast.calls).toBe(3);
  });

  it('addRecording: мусорный id — NotFoundError', async () => {
    await expect(
      service.addRecording('not-an-id', { url: 'https://drive.example/rec' }, NOW),
    ).rejects.toThrow('не найдена');
  });

  it('update: мусорный id — NotFoundError', async () => {
    await expect(service.update('not-an-id', { topic: 'Тема' }, NOW)).rejects.toThrow(
      'не найдена',
    );
  });

  it('update durationMin: у даты из расписания — ConflictError', async () => {
    const classId = await createClass();
    const planned = await lessonModel.create({
      classId,
      plannedAt: new Date('2026-09-03T16:00:00Z'),
      startsAt: new Date('2026-09-03T16:00:00Z'),
      durationMin: 60,
    });

    await expect(
      service.update(planned._id.toString(), { durationMin: 90 }, NOW),
    ).rejects.toThrow('берётся из расписания');
  });

  it('update durationMin: у разовой даты — меняется', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    const updated = await service.update(created.id, { durationMin: 90 }, NOW);

    expect(updated.durationMin).toBe(90);
  });

  it('remove: дату из расписания (с plannedAt) удалить нельзя — ConflictError', async () => {
    const classId = await createClass();
    const planned = await lessonModel.create({
      classId,
      plannedAt: new Date('2026-09-03T16:00:00Z'),
      startsAt: new Date('2026-09-03T16:00:00Z'),
      durationMin: 60,
    });

    await expect(service.remove(planned._id.toString())).rejects.toThrow('Отмените её');
    await expect(service.getById(planned._id.toString())).resolves.toBeDefined();
  });

  it('remove: разовую дату удаляет, повторный getById — NotFoundError', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

    await service.remove(created.id);

    await expect(service.getById(created.id)).rejects.toThrow('не найдена');
  });

  // ADR-0056 «Последствия»: удаление даты не должно оставлять привязку,
  // указывающую в никуда — материал остаётся, id пропадает из lessonIds.
  it('remove: отвязывает удалённую дату от materials.lessonIds, материал остаётся', async () => {
    const classId = await createClass();
    const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
    const authorId = new Types.ObjectId();
    const material = await materialModel.create({
      title: 'Ссылка со вторника',
      url: 'https://example.com/link',
      kind: 'article',
      classIds: [],
      lessonIds: [created.id],
      access: 'all',
      createdBy: authorId,
    });

    await service.remove(created.id);

    const afterRemove = await materialModel.findById(material._id).lean();
    expect(afterRemove).not.toBeNull();
    expect(afterRemove?.lessonIds).toEqual([]);
  });

  it('remove: несуществующий id — NotFoundError', async () => {
    await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найдена',
    );
  });

  it('remove: мусорный id — NotFoundError', async () => {
    await expect(service.remove('not-an-id')).rejects.toThrow('не найдена');
  });

  // ADR-0075 — тег живёт у даты занятия, те же правила, что у материалов
  // (materials.service.spec.ts): нормализация при записи, фильтр по тегу.
  describe('теги (ADR-0075)', () => {
    it('create: нормализует теги — обрезка, схлопывание пробелов, дедуп без учёта регистра', async () => {
      const classId = await createClass();

      const created = await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['  Дракон ', 'дракон', 'начинающие  группа'],
      });

      expect(created.tags).toEqual(['Дракон', 'начинающие группа']);
    });

    it('create без tags — пустой массив, не undefined', async () => {
      const classId = await createClass();

      const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });

      expect(created.tags).toEqual([]);
    });

    it('update: нормализует присланные теги', async () => {
      const classId = await createClass();
      const created = await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['раз'],
      });

      const updated = await service.update(
        created.id,
        { tags: ['Два', 'два', '  Три  '] },
        NOW,
      );

      expect(updated.tags).toEqual(['Два', 'Три']);
    });

    it('update без tags — прежние теги не трогает', async () => {
      const classId = await createClass();
      const created = await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон'],
      });

      const updated = await service.update(created.id, { topic: 'Новая тема' }, NOW);

      expect(updated.tags).toEqual(['дракон']);
    });

    it('create → list: read-after-write — фильтр по тегу находит дату', async () => {
      const classId = await createClass();
      const created = await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон', 'начинающие'],
      });
      await service.create({ classId, startsAt: '2026-09-04T16:00:00Z' });

      const list = await service.list({ from: FROM, to: TO, tag: 'дракон' });

      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe(created.id);
    });

    it('list: фильтр по несуществующему тегу — пустой список, не ошибка', async () => {
      const classId = await createClass();
      await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон'],
      });

      const list = await service.list({ from: FROM, to: TO, tag: 'нет-такого' });

      expect(list).toEqual([]);
    });

    it('list: пустая строка в query.tag — как отсутствие фильтра', async () => {
      const classId = await createClass();
      await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон'],
      });

      const list = await service.list({ from: FROM, to: TO, tag: '' });

      expect(list).toHaveLength(1);
    });

    it('дата занятия без поля tags (до этого PR) читается как []', async () => {
      const classId = await createClass();
      const created = await service.create({ classId, startsAt: '2026-09-03T16:00:00Z' });
      // Имитируем дату, заведённую до ADR-0075: поля в базе нет вовсе.
      await lessonModel.collection.updateOne(
        { _id: new Types.ObjectId(created.id) },
        { $unset: { tags: '' } },
      );

      const list = await service.list({ from: FROM, to: TO });

      expect(list.find((l) => l.id === created.id)?.tags).toEqual([]);
    });
  });

  // ADR-0078: тег снимает требование окна планировщика (окно нужно только
  // «Планированию»); список тогда идёт от новых к старым с лимитом по
  // умолчанию, а не с максимумом горизонта. Без тега окно обязательно, как и
  // раньше — «дай всё» по-прежнему запрещено (CLAUDE.md «API»).
  describe('окно и тег (ADR-0078)', () => {
    it('ни окна, ни тега — InvalidInputError, как и раньше', async () => {
      await expect(service.list({})).rejects.toThrow(InvalidInputError);
    });

    it('classId без окна и без тега тоже не заменяет окно', async () => {
      const classId = await createClass();

      await expect(service.list({ classId })).rejects.toThrow(InvalidInputError);
    });

    it('from без to, тега нет — InvalidInputError', async () => {
      await expect(service.list({ from: FROM })).rejects.toThrow(InvalidInputError);
    });

    it('тег без окна — список приходит, окно не требуется', async () => {
      const classId = await createClass();
      await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон'],
      });

      await expect(service.list({ tag: 'дракон' })).resolves.toHaveLength(1);
    });

    it('тег без окна — сортировка от новых к старым', async () => {
      const classId = await createClass();
      const older = await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон'],
      });
      const newer = await service.create({
        classId,
        startsAt: '2026-09-10T16:00:00Z',
        tags: ['дракон'],
      });

      const list = await service.list({ tag: 'дракон' });

      expect(list.map((l) => l.id)).toEqual([newer.id, older.id]);
    });

    it('тег без окна — лимит по умолчанию LIST_LIMIT_DEFAULT, не LIST_LIMIT_MAX', async () => {
      const classId = await createClass();
      const docs = Array.from({ length: LIST_LIMIT_DEFAULT + 5 }, (_, i) => ({
        classId,
        startsAt: DateTime.fromISO('2026-01-01T00:00:00Z', { zone: 'utc' })
          .plus({ days: i })
          .toJSDate(),
        durationMin: 60,
        tags: ['дракон'],
      }));
      await lessonModel.create(docs);

      const list = await service.list({ tag: 'дракон' });

      expect(list).toHaveLength(LIST_LIMIT_DEFAULT);
    });

    it('тег вместе с окном — поведение прежнее: по возрастанию, окно ограничивает выборку', async () => {
      const classId = await createClass();
      const inWindow = await service.create({
        classId,
        startsAt: '2026-09-03T16:00:00Z',
        tags: ['дракон'],
      });
      await service.create({
        classId,
        startsAt: '2026-09-20T16:00:00Z', // за пределами FROM..TO
        tags: ['дракон'],
      });

      const list = await service.list({ from: FROM, to: TO, tag: 'дракон' });

      expect(list.map((l) => l.id)).toEqual([inWindow.id]);
    });
  });
});
