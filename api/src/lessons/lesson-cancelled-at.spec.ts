// Против настоящей Mongo (CLAUDE.md «Тесты»): `cancelledAt` — момент отмены, от
// которого шаг тика «отмена занятий» (ADR-0162) сутки сообщает ученикам.
// Ставится при переходе в 'cancelled', первый момент не сдвигается повторным
// PATCH, возврат в 'scheduled' снимает его; занятие, отменённое до появления
// поля, не получает момента вовсе — его не объявят задним числом.
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
import { LESSON_NOT_FOUND } from './lessons.queries';
import { LessonsService } from './lessons.service';

const CANCELLED_AT = DateTime.fromISO('2026-09-03T12:00:00Z', { zone: 'utc' });
const LATER = DateTime.fromISO('2026-09-03T15:30:00Z', { zone: 'utc' });
const STARTS_AT = '2026-09-10T16:00:00Z';

describe('LessonsService.update — cancelledAt (ADR-0162)', () => {
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
    // Рассылки и материалы этим тестам не нужны: отмена их не трогает.
    service = new LessonsService(
      lessonModel,
      classModel,
      {} as unknown as RecordingBroadcastService,
      {} as unknown as LessonLinkRebuildService,
      connection.model<BroadcastRecord>(BroadcastRecord.name, BroadcastSchema),
      connection.model<UserRecord>(UserRecord.name, UserSchema),
      connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema),
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

  async function cancelledAtOf(id: string): Promise<Date | undefined> {
    const doc = await lessonModel
      .findById(id, { cancelledAt: 1 })
      .lean<{ cancelledAt?: Date }>();
    return doc?.cancelledAt;
  }

  it('scheduled → cancelled ставит момент отмены — now вызова', async () => {
    const id = await createLesson();

    const updated = await service.update(id, { status: 'cancelled' }, CANCELLED_AT);

    expect(updated.status).toBe('cancelled');
    expect(await cancelledAtOf(id)).toEqual(CANCELLED_AT.toJSDate());
  });

  it('cancelled → cancelled оставляет первый момент: повторный PATCH его не сдвигает', async () => {
    const id = await createLesson();
    await service.update(id, { status: 'cancelled' }, CANCELLED_AT);

    await service.update(id, { status: 'cancelled' }, LATER);

    expect(await cancelledAtOf(id)).toEqual(CANCELLED_AT.toJSDate());
  });

  it('cancelled → scheduled снимает момент, следующая отмена ставит свой', async () => {
    const id = await createLesson();
    await service.update(id, { status: 'cancelled' }, CANCELLED_AT);

    const restored = await service.update(id, { status: 'scheduled' }, CANCELLED_AT);

    expect(restored.status).toBe('scheduled');
    expect(await cancelledAtOf(id)).toBeUndefined();

    await service.update(id, { status: 'cancelled' }, LATER);
    expect(await cancelledAtOf(id)).toEqual(LATER.toJSDate());
  });

  it('PATCH без статуса (тема) отменённому занятию момент не трогает', async () => {
    const id = await createLesson();
    await service.update(id, { status: 'cancelled' }, CANCELLED_AT);

    await service.update(id, { topic: 'Новая тема' }, LATER);

    expect(await cancelledAtOf(id)).toEqual(CANCELLED_AT.toJSDate());
  });

  it('занятие, отменённое до появления поля, повторным cancelled момента не получает — задним числом не объявляют', async () => {
    const id = await createLesson();
    await lessonModel.updateOne({ _id: id }, { $set: { status: 'cancelled' } });

    await service.update(id, { status: 'cancelled' }, LATER);

    expect(await cancelledAtOf(id)).toBeUndefined();
  });

  it('несуществующее занятие — NotFoundError, записать момент некуда', async () => {
    await expect(
      service.update('64b7f0f0f0f0f0f0f0f0f0f0', { status: 'cancelled' }, LATER),
    ).rejects.toThrow(LESSON_NOT_FOUND);
  });

  it('момент отмены наружу не уходит: в DTO его нет', async () => {
    const id = await createLesson();

    const updated = await service.update(id, { status: 'cancelled' }, CANCELLED_AT);

    expect(Object.keys(updated)).not.toContain('cancelledAt');
  });
});
