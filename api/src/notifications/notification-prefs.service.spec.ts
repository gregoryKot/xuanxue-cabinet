// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): read-after-write на переключатель, идемпотентность второго
// клика, уникальный индекс userId.
import type { Model } from 'mongoose';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { NotificationPrefsService } from './notification-prefs.service';

describe('NotificationPrefsService', () => {
  let memory: MemoryMongo;
  let model: Model<NotificationPrefsRecord>;
  let service: NotificationPrefsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    service = new NotificationPrefsService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('без документа — дефолт роли как есть', async () => {
    expect(await service.get('u1', ['student'])).toEqual({
      enabled: ['lesson_soon', 'teacher_message'],
    });
  });

  it('гость (без ролей) — дефолт как у ученика', async () => {
    expect(await service.get('u1', [])).toEqual({
      enabled: ['lesson_soon', 'teacher_message'],
    });
  });

  it('выключил вид уведомления → прочитал: его нет (read-after-write)', async () => {
    await service.set('u1', 'teacher_message', false);

    expect(await service.get('u1', ['student'])).toEqual({ enabled: ['lesson_soon'] });
  });

  it('включил вид сверх дефолта роли → прочитал: он есть', async () => {
    await service.set('u1', 'payments', true);

    expect(await service.get('u1', ['student'])).toEqual({
      enabled: ['lesson_soon', 'teacher_message', 'payments'],
    });
  });

  it('второй клик той же кнопки (то же значение) — не ломается, документ один', async () => {
    await service.set('u1', 'lesson_soon', false);
    await service.set('u1', 'lesson_soon', false);

    expect(await service.get('u1', ['student'])).toEqual({
      enabled: ['teacher_message'],
    });
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
  });

  it('переключил туда-обратно — возвращается дефолт, документ остаётся один', async () => {
    await service.set('u1', 'lesson_soon', false);
    await service.set('u1', 'lesson_soon', true);

    expect(await service.get('u1', ['student'])).toEqual({
      enabled: ['lesson_soon', 'teacher_message'],
    });
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
  });

  it('настройки двух людей не пересекаются', async () => {
    await service.set('u1', 'teacher_message', false);
    await service.set('u2', 'payments', true);

    expect(await service.get('u1', ['student'])).toEqual({ enabled: ['lesson_soon'] });
    expect(await service.get('u2', ['student'])).toEqual({
      enabled: ['lesson_soon', 'teacher_message', 'payments'],
    });
  });

  it('второй документ с тем же userId — E11000 (уникальный индекс из схемы)', async () => {
    await model.create({ userId: 'u1', overrides: [] });

    await expect(model.create({ userId: 'u1', overrides: [] })).rejects.toMatchObject({
      code: MONGO_DUPLICATE_KEY_CODE,
    });
  });
});
