// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): read-after-write, шифрование секретов, PATCH null → $unset,
// запрет удаления даты из расписания, дефолт title записи. addRecording
// зовёт RecordingBroadcastService.ensureForRecording всегда (идемпотентность
// самой рассылки — на уникальном индексе (lessonId, recordingKey), не здесь)
// — фейк считает вызовы и запоминает переданный url, сама рассылка
// (broadcast+доставки, cancelled) проверена в recording-broadcast.service.spec.ts.
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import type { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import type { RecordingBroadcastService } from '../broadcasts/recording-broadcast.service';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
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
    recordingBroadcast = fakeRecordingBroadcast();
    lessonLinkRebuild = fakeLessonLinkRebuild();
    service = new LessonsService(
      lessonModel,
      classModel,
      recordingBroadcast,
      lessonLinkRebuild,
      broadcastModel,
      userModel,
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

  it('remove: несуществующий id — NotFoundError', async () => {
    await expect(service.remove('507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найдена',
    );
  });

  it('remove: мусорный id — NotFoundError', async () => {
    await expect(service.remove('not-an-id')).rejects.toThrow('не найдена');
  });
});
