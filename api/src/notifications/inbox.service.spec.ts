// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): лимит,
// сортировка, unreadCount и владение проверяются запросом, не моком модели.
// Владение по HTTP (401/404 у чужого id) — inbox-ownership.e2e-spec.ts;
// здесь — сам сервис.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { InboxService } from './inbox.service';
import { NotificationRecord, NotificationSchema } from './notification.schema';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });

describe('InboxService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<NotificationRecord>;
  let service: InboxService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    service = new InboxService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  describe('list', () => {
    it('без записей — пустая лента, unreadCount 0 (не мусор на чистой базе)', async () => {
      await expect(service.list('u1', {})).resolves.toEqual({
        items: [],
        unreadCount: 0,
      });
    });

    it('видит только свои записи, не чужие', async () => {
      await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });
      await model.create({
        userId: 'u2',
        kind: 'exam_result',
        attemptId: 'a2',
        outcome: 'passed',
        readAt: null,
      });

      const page = await service.list('u1', {});
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.attemptId).toBe('a1');
      expect(page.unreadCount).toBe(1);
    });

    it('недавно переоценённые (updatedAt) — сверху, не по порядку создания', async () => {
      const older = await model.create({
        userId: 'u1',
        kind: 'attempt_submitted',
        attemptId: 'a-older',
        readAt: null,
      });
      await model.create({
        userId: 'u1',
        kind: 'attempt_submitted',
        attemptId: 'a-newer',
        readAt: null,
      });
      // «older» переоценили последним — обновление должно всплыть первым.
      await model.updateOne({ _id: older._id }, { $set: { readAt: null } });

      const page = await service.list('u1', {});
      expect(page.items.map((i) => i.attemptId)).toEqual(['a-older', 'a-newer']);
    });

    it('лимит применяется, unreadCount считает по всей ленте, не только по странице', async () => {
      for (let i = 0; i < 3; i += 1) {
        await model.create({
          userId: 'u1',
          kind: 'attempt_submitted',
          attemptId: `a${i}`,
          readAt: null,
        });
      }

      const page = await service.list('u1', { limit: 2 });
      expect(page.items).toHaveLength(2);
      expect(page.unreadCount).toBe(3);
    });

    it('прочитанное не считается в unreadCount', async () => {
      await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: NOW.toJSDate(),
      });

      const page = await service.list('u1', {});
      expect(page.unreadCount).toBe(0);
      expect(page.items[0]?.readAt).toBe(NOW.toUTC().toISO());
    });

    it('убранное (dismissedAt) не попадает в ленту и не считается в unreadCount', async () => {
      await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
        dismissedAt: NOW.toJSDate(),
      });

      const page = await service.list('u1', {});
      expect(page.items).toEqual([]);
      expect(page.unreadCount).toBe(0);
    });
  });

  describe('markRead', () => {
    it('read-after-write — отметил, прочитал: readAt проставлен', async () => {
      const doc = await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });

      const dto = await service.markRead('u1', doc._id.toString(), NOW);

      expect(dto.readAt).toBe(NOW.toUTC().toISO());
      const stored = await model.findById(doc._id).lean();
      expect(stored?.readAt).toEqual(NOW.toJSDate());
    });

    it('чужая строка — NotFoundError, не молчаливый 200 и не утечка чужого id', async () => {
      const doc = await model.create({
        userId: 'u2',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });

      await expect(service.markRead('u1', doc._id.toString(), NOW)).rejects.toThrow(
        'Уведомление не найдено',
      );
      const stored = await model.findById(doc._id).lean();
      // Чужая попытка пометить — не должна была ничего изменить у Б.
      expect(stored?.readAt).toBeNull();
    });

    it('несуществующий id — NotFoundError, не 500 (не валится на CastError)', async () => {
      await expect(
        service.markRead('u1', '507f1f77bcf86cd799439099', NOW),
      ).rejects.toThrow('Уведомление не найдено');
    });

    it('id не похож на ObjectId — тот же NotFoundError, без похода в Mongo', async () => {
      await expect(service.markRead('u1', 'not-an-id', NOW)).rejects.toThrow(
        'Уведомление не найдено',
      );
    });

    it('повторная отметка — не ошибка, время отметки просто обновляется', async () => {
      const doc = await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });

      await service.markRead('u1', doc._id.toString(), NOW);
      const second = await service.markRead(
        'u1',
        doc._id.toString(),
        NOW.plus({ minutes: 5 }),
      );

      expect(second.readAt).toBe(NOW.plus({ minutes: 5 }).toUTC().toISO());
    });
  });

  describe('dismiss', () => {
    it('read-after-write — убрал: в следующей выдаче строки нет', async () => {
      const doc = await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });

      await service.dismiss('u1', doc._id.toString(), NOW);

      const page = await service.list('u1', {});
      expect(page.items).toEqual([]);
      const stored = await model.findById(doc._id).lean();
      expect(stored?.dismissedAt).toEqual(NOW.toJSDate());
    });

    it('убрали непрочитанное — unreadCount уменьшается', async () => {
      const doc = await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });
      await model.create({
        userId: 'u1',
        kind: 'attempt_submitted',
        attemptId: 'a2',
        readAt: null,
      });

      await service.dismiss('u1', doc._id.toString(), NOW);

      const page = await service.list('u1', {});
      expect(page.unreadCount).toBe(1);
    });

    it('чужая строка — NotFoundError, ничего не меняет у владельца', async () => {
      const doc = await model.create({
        userId: 'u2',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });

      await expect(service.dismiss('u1', doc._id.toString(), NOW)).rejects.toThrow(
        'Уведомление не найдено',
      );
      const stored = await model.findById(doc._id).lean();
      expect(stored?.dismissedAt).toBeUndefined();
    });

    it('несуществующий id — NotFoundError, не 500', async () => {
      await expect(
        service.dismiss('u1', '507f1f77bcf86cd799439099', NOW),
      ).rejects.toThrow('Уведомление не найдено');
    });

    it('id не похож на ObjectId — тот же NotFoundError, без похода в Mongo', async () => {
      await expect(service.dismiss('u1', 'not-an-id', NOW)).rejects.toThrow(
        'Уведомление не найдено',
      );
    });

    it('повторный вызов — не ошибка, время убирания просто перезаписывается', async () => {
      const doc = await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a1',
        outcome: 'passed',
        readAt: null,
      });

      await service.dismiss('u1', doc._id.toString(), NOW);
      await expect(
        service.dismiss('u1', doc._id.toString(), NOW.plus({ minutes: 5 })),
      ).resolves.toBeDefined();
      const stored = await model.findById(doc._id).lean();
      expect(stored?.dismissedAt).toEqual(NOW.plus({ minutes: 5 }).toJSDate());
    });
  });

  describe('markAllRead', () => {
    it('гасит только свои непрочитанные, не трогает чужие', async () => {
      await model.create({
        userId: 'u1',
        kind: 'attempt_submitted',
        attemptId: 'a1',
        readAt: null,
      });
      await model.create({
        userId: 'u1',
        kind: 'exam_result',
        attemptId: 'a2',
        outcome: 'passed',
        readAt: null,
      });
      await model.create({
        userId: 'u2',
        kind: 'attempt_submitted',
        attemptId: 'a3',
        readAt: null,
      });

      await service.markAllRead('u1', NOW);

      expect(await model.countDocuments({ userId: 'u1', readAt: null })).toBe(0);
      expect(await model.countDocuments({ userId: 'u2', readAt: null })).toBe(1);
    });

    it('пустая лента — не ошибка, no-op', async () => {
      await expect(service.markAllRead('u1', NOW)).resolves.toBeUndefined();
    });
  });
});
