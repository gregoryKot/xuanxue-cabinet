// Против настоящей Mongo: «вставить строку ленты, только если её нет»
// (ADR-0162). Атомарность держит уникальный индекс (userId, kind, lessonId), а
// не проверка перед записью, поэтому гонка проверяется настоящими параллельными
// вызовами, не моком.
import type { Model } from 'mongoose';
import { decryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { insertNotificationRowOnce } from './notification-row-once';
import {
  NOTIFICATION_ENCRYPT_SCHEMA,
  NotificationRecord,
  NotificationSchema,
} from './notification.schema';

interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

describe('insertNotificationRowOnce', () => {
  let memory: MemoryMongo;
  let model: Model<NotificationRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    await model.syncIndexes();
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  const INPUT = {
    userId: 'u1',
    kind: 'lesson_soon',
    lessonId: 'l1',
    lessonTitle: 'Цигун для глаз',
  } as const;

  it('первая вставка — true, строка непрочитана и не убрана, название зашифровано', async () => {
    expect(await insertNotificationRowOnce(model, INPUT)).toBe(true);

    const row = await model
      .findOne({ userId: 'u1', kind: 'lesson_soon' })
      .lean<NotificationRecord & Timestamps>();
    expect(row?.lessonId).toBe('l1');
    expect(row?.readAt).toBeNull();
    expect(row?.dismissedAt).toBeNull();
    // TTL-индекс ленты считает от createdAt: без него строка не истекла бы.
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.updatedAt).toBeInstanceOf(Date);
    expect(row?.lessonTitle).not.toBe('Цигун для глаз');
    expect(decryptRecord(row ?? {}, NOTIFICATION_ENCRYPT_SCHEMA)).toMatchObject({
      lessonTitle: 'Цигун для глаз',
    });
  });

  it('вторая вставка той же пары — false, строка не изменилась (ни прочитанность, ни updatedAt)', async () => {
    await insertNotificationRowOnce(model, INPUT);
    const readAt = new Date('2026-09-06T17:00:00Z');
    await model.updateOne({ userId: 'u1' }, { $set: { readAt } }, { timestamps: false });
    const before = await model.findOne({ userId: 'u1' }).lean();

    expect(
      await insertNotificationRowOnce(model, { ...INPUT, lessonTitle: 'Другое' }),
    ).toBe(false);

    const after = await model.findOne({ userId: 'u1' }).lean();
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
    expect(after).toEqual(before);
    expect(after?.readAt).toEqual(readAt);
  });

  it('другой человек или другое занятие — независимые строки', async () => {
    expect(await insertNotificationRowOnce(model, INPUT)).toBe(true);
    expect(await insertNotificationRowOnce(model, { ...INPUT, userId: 'u2' })).toBe(true);
    expect(await insertNotificationRowOnce(model, { ...INPUT, lessonId: 'l2' })).toBe(
      true,
    );

    expect(await model.countDocuments({})).toBe(3);
  });

  // ADR-0162: вид входит в уникальный ключ (userId, kind, lessonId), поэтому
  // отмена занятия не упирается в уже записанное напоминание о нём.
  it('lesson_soon и lesson_cancelled одного занятия — две независимые строки', async () => {
    expect(await insertNotificationRowOnce(model, INPUT)).toBe(true);
    expect(
      await insertNotificationRowOnce(model, { ...INPUT, kind: 'lesson_cancelled' }),
    ).toBe(true);
    expect(
      await insertNotificationRowOnce(model, { ...INPUT, kind: 'lesson_cancelled' }),
    ).toBe(false);

    expect(await model.countDocuments({ userId: 'u1', lessonId: 'l1' })).toBe(2);
  });

  it('lessonStartsAt записывается датой и не шифруется', async () => {
    const lessonStartsAt = new Date('2026-09-10T16:00:00Z');

    await insertNotificationRowOnce(model, {
      ...INPUT,
      kind: 'lesson_cancelled',
      lessonStartsAt,
    });

    const row = await model.findOne({ userId: 'u1' }).lean();
    expect(row?.lessonStartsAt).toEqual(lessonStartsAt);
  });

  it('пять вызовов разом — ровно один true и одна строка', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => insertNotificationRowOnce(model, INPUT)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
  });

  it('не ловит чужие ошибки: сбой записи, не дубль, летит наверх', async () => {
    const broken = { ...INPUT, kind: 'не_вид' } as unknown as typeof INPUT;

    await expect(insertNotificationRowOnce(model, broken)).rejects.toThrow();
  });
});
