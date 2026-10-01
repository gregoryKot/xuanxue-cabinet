// Свой день напоминания об оплате (ADR-0161) против настоящей Mongo: запись →
// чтение, сброс в `$unset`, пачка одним запросом, гонка первых записей.
import type { Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { NotificationPrefsService } from './notification-prefs.service';

describe('NotificationPrefsService — день напоминания об оплате', () => {
  let memory: MemoryMongo;
  let model: Model<NotificationPrefsRecord>;
  let service: NotificationPrefsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    await model.syncIndexes();
    service = new NotificationPrefsService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('ничего не выбирали — дня нет', async () => {
    expect(await service.getPaymentReminderDay('u1')).toBeUndefined();
  });

  it('записал → прочитал (read-after-write); второй раз другой день перезаписывает', async () => {
    await service.setPaymentReminderDay('u1', 12);
    expect(await service.getPaymentReminderDay('u1')).toBe(12);

    await service.setPaymentReminderDay('u1', 20);
    expect(await service.getPaymentReminderDay('u1')).toBe(20);
    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
  });

  it('день не трогает переключатели видов уведомлений и наоборот', async () => {
    await service.set('u1', 'exam_result', false);
    await service.setPaymentReminderDay('u1', 7);
    await service.set('u1', 'lesson_soon', false);

    expect(await service.getPaymentReminderDay('u1')).toBe(7);
    expect(await service.get('u1', [])).toEqual({
      enabled: ['lesson_cancelled', 'payment_due'],
    });
  });

  it('null снимает выбор: поле удалено из документа, а не записано нулём', async () => {
    await service.setPaymentReminderDay('u1', 12);

    await service.setPaymentReminderDay('u1', null);

    expect(await service.getPaymentReminderDay('u1')).toBeUndefined();
    const doc = await model.findOne({ userId: 'u1' }).lean();
    expect(doc).not.toBeNull();
    expect(doc).not.toHaveProperty('paymentReminderDay');
  });

  it('сброс там, где ничего не выбирали, документ не заводит', async () => {
    await service.setPaymentReminderDay('u1', null);

    expect(await model.countDocuments({})).toBe(0);
  });

  it('пачка: одним запросом, в карте только те, кто выбрал свой день', async () => {
    await service.setPaymentReminderDay('u1', 3);
    await service.setPaymentReminderDay('u2', 28);
    await service.set('u3', 'exam_result', false);
    await service.setPaymentReminderDay('u4', 15);
    await service.setPaymentReminderDay('u4', null);
    const find = jest.spyOn(model, 'find');

    const days = await service.getPaymentReminderDays(['u1', 'u2', 'u3', 'u4', 'u5']);

    expect(find).toHaveBeenCalledTimes(1);
    expect(days).toEqual(
      new Map([
        ['u1', 3],
        ['u2', 28],
      ]),
    );
    find.mockRestore();
  });

  it('пустая пачка — пустая карта без запроса', async () => {
    const find = jest.spyOn(model, 'find');

    expect(await service.getPaymentReminderDays([])).toEqual(new Map());

    expect(find).not.toHaveBeenCalled();
    find.mockRestore();
  });

  it('гонка: две первые записи одновременно — один документ, победил один из дней', async () => {
    await Promise.all([
      service.setPaymentReminderDay('u1', 5),
      service.setPaymentReminderDay('u1', 9),
    ]);

    expect(await model.countDocuments({ userId: 'u1' })).toBe(1);
    expect([5, 9]).toContain(await service.getPaymentReminderDay('u1'));
  });

  it('схема не пускает день вне 1–31 даже мимо DTO', async () => {
    await expect(
      model.create({ userId: 'u1', paymentReminderDay: 32 }),
    ).rejects.toThrow();
    await expect(model.create({ userId: 'u2', paymentReminderDay: 0 })).rejects.toThrow();
  });
});
