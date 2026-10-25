// Против настоящей Mongo (CLAUDE.md «Тесты»): `recordingReadyAt` — момент, когда
// у занятия появилась первая запись, от которого шаг тика «запись ученикам»
// (ADR-0162) сутки сообщает тем, кто включил вид «Запись занятия». Ставится
// вместе с записью, вторая запись его не двигает, повтор url/file_id не
// добавляет ни записи, ни момента; наружу поле не уходит.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import type { RecordingBroadcastService } from '../broadcasts/recording-broadcast.service';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { MaterialRecord, MaterialSchema } from '../materials/material.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import type { LessonVideosService } from '../lesson-videos/lesson-videos.service';
import { LessonsService } from './lessons.service';

const FIRST = DateTime.fromISO('2026-09-03T20:00:00Z', { zone: 'utc' });
const LATER = DateTime.fromISO('2026-09-04T09:30:00Z', { zone: 'utc' });
const STARTS_AT = '2026-09-03T16:00:00Z';
const URL_A = 'https://example.com/rec-a';
const URL_B = 'https://example.com/rec-b';

describe('LessonsService.addRecording — recordingReadyAt (ADR-0162)', () => {
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
    // Рассылка записи в канал к моменту записи отношения не имеет — заглушка.
    service = new LessonsService(
      lessonModel,
      classModel,
      {
        ensureForRecording: jest.fn().mockResolvedValue(undefined),
      } as unknown as RecordingBroadcastService,
      {} as unknown as LessonLinkRebuildService,
      connection.model<BroadcastRecord>(BroadcastRecord.name, BroadcastSchema),
      connection.model<UserRecord>(UserRecord.name, UserSchema),
      connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema),
      {} as unknown as LessonVideosService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([lessonModel.deleteMany({}), classModel.deleteMany({})]);
  });

  async function createLesson(): Promise<string> {
    const cls = await classModel.create({ title: 'Тайцзицюань', format: 'online' });
    const created = await service.create({
      classId: cls._id.toString(),
      startsAt: STARTS_AT,
    });
    return created.id;
  }

  async function stateOf(id: string) {
    const doc = await lessonModel
      .findById(id, { recordingReadyAt: 1, recordings: 1 })
      .lean<{ recordingReadyAt?: Date; recordings: { url?: string }[] }>();
    return { readyAt: doc?.recordingReadyAt, urls: doc?.recordings.map((r) => r.url) };
  }

  it('первая запись ставит момент — now вызова (и с ссылкой, и с видео бота)', async () => {
    const byUrl = await createLesson();
    const byBot = await createLesson();

    await service.addRecording(byUrl, { url: URL_A }, FIRST);
    await service.addRecording(byBot, { telegramFileId: 'file-1' }, LATER);

    expect((await stateOf(byUrl)).readyAt).toEqual(FIRST.toJSDate());
    expect((await stateOf(byBot)).readyAt).toEqual(LATER.toJSDate());
  });

  it('вторая запись того же занятия момент не двигает, а сама добавляется', async () => {
    const id = await createLesson();
    await service.addRecording(id, { url: URL_A }, FIRST);

    await service.addRecording(id, { url: URL_B }, LATER);

    expect(await stateOf(id)).toEqual({
      readyAt: FIRST.toJSDate(),
      urls: [URL_A, URL_B],
    });
  });

  it('повтор той же ссылки — записи не плодятся и момент остаётся первым', async () => {
    const id = await createLesson();
    await service.addRecording(id, { url: URL_A }, FIRST);

    await service.addRecording(id, { url: URL_A }, LATER);

    expect(await stateOf(id)).toEqual({ readyAt: FIRST.toJSDate(), urls: [URL_A] });
  });

  // Повтор не добавил запись — объявлять нечего: момент ставит та же команда,
  // что и `$push`, а не отдельная запись после неё.
  it('повтор при записи без момента (до появления поля) момента не ставит: запись не добавилась', async () => {
    const id = await createLesson();
    await lessonModel.updateOne(
      { _id: id },
      { $push: { recordings: { title: 'Старая', url: URL_A } } },
    );

    await service.addRecording(id, { url: URL_A }, LATER);

    expect(await stateOf(id)).toEqual({ readyAt: undefined, urls: [URL_A] });
  });

  it('новая запись к занятию, где записи лежали до поля, ставит момент: она и есть событие', async () => {
    const id = await createLesson();
    await lessonModel.updateOne(
      { _id: id },
      { $push: { recordings: { title: 'Старая', url: URL_A } } },
    );

    await service.addRecording(id, { url: URL_B }, LATER);

    expect(await stateOf(id)).toEqual({
      readyAt: LATER.toJSDate(),
      urls: [URL_A, URL_B],
    });
  });

  it('запись без источника отклонена — момента нет', async () => {
    const id = await createLesson();

    await expect(service.addRecording(id, {}, FIRST)).rejects.toThrow();

    expect((await stateOf(id)).readyAt).toBeUndefined();
  });

  it('момент наружу не уходит: в DTO ответа его нет', async () => {
    const id = await createLesson();

    const updated = await service.addRecording(id, { url: URL_A }, FIRST);

    expect(Object.keys(updated)).not.toContain('recordingReadyAt');
    expect(updated.recordings).toHaveLength(1);
  });
});
