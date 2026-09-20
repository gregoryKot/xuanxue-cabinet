// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): обе даты (30 дней после подтверждения, 90 без него) со сравнением
// строго по границе, батч-лимит на реальном count, снимок из бота без
// screenshotImageId — та же уборка, что и запись из кабинета. `now` —
// явный DateTime параметром (ADR-0050), не DateTime.utc() внутри теста.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS,
  PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS,
  PaymentScreenshotSweepService,
} from './payment-screenshot-sweep.service';
import { PaymentScreenshotRecord } from './payment-screenshot.schema';
import { PaymentRecord } from './payment.schema';

const NOW = DateTime.fromISO('2026-09-20T12:00:00Z', { zone: 'utc' });

describe('PaymentScreenshotSweepService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let paymentModel: Model<PaymentRecord>;
  let screenshotModel: Model<PaymentScreenshotRecord>;
  let service: PaymentScreenshotSweepService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    paymentModel = connection.model<PaymentRecord>(PaymentRecord.name);
    screenshotModel = connection.model<PaymentScreenshotRecord>(
      PaymentScreenshotRecord.name,
    );
    service = new PaymentScreenshotSweepService(paymentModel, screenshotModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await paymentModel.deleteMany({});
    await screenshotModel.deleteMany({});
  });

  async function makeScreenshot(createdAt?: DateTime): Promise<Types.ObjectId> {
    const doc = await screenshotModel.create({
      bytes: Buffer.from('байты снимка перевода'),
      contentType: 'image/jpeg',
      sizeBytes: 3,
    });
    if (createdAt) {
      // Через .collection (не через .updateOne модели) — timestamps-плагин
      // Mongoose иначе молча стирает явный createdAt из $set (immutable-поле).
      await screenshotModel.collection.updateOne(
        { _id: doc._id },
        { $set: { createdAt: createdAt.toJSDate() } },
      );
    }
    return doc._id;
  }

  it('подтверждена 31 день назад со снимком — байты и поля снимаются, оплата остаётся paid', async () => {
    const imageId = await makeScreenshot();
    const confirmedAt = NOW.minus({
      days: PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS + 1,
    });
    const payment = await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-08',
      status: 'paid',
      confirmedBy: new Types.ObjectId(),
      confirmedAt: confirmedAt.toJSDate(),
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: confirmedAt.minus({ days: 2 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(0);
    const after = await paymentModel.findById(payment._id).lean();
    expect(after?.status).toBe('paid');
    expect(after?.confirmedAt?.toISOString()).toBe(confirmedAt.toJSDate().toISOString());
    expect(after?.screenshotKind).toBeUndefined();
    expect(after?.screenshotImageId).toBeUndefined();
    expect(after?.screenshotAt).toBeUndefined();
    expect(after?.screenshotFileId).toBeUndefined();
    expect(after?.screenshotFileUniqueId).toBeUndefined();
    // Сама оплата осталась — деньги не забываем вместе с картинкой.
    await expect(paymentModel.countDocuments({ _id: payment._id })).resolves.toBe(1);
  });

  it('подтверждена 29 дней назад — не трогаем', async () => {
    const imageId = await makeScreenshot();
    const confirmedAt = NOW.minus({
      days: PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS - 1,
    });
    await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-08',
      status: 'paid',
      confirmedBy: new Types.ObjectId(),
      confirmedAt: confirmedAt.toJSDate(),
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: confirmedAt.toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(1);
  });

  it('подтверждена ровно 30 дней назад — граница не задета ни с той, ни с другой стороны', async () => {
    const imageId = await makeScreenshot();
    const confirmedAt = NOW.minus({ days: PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS });
    await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-08',
      status: 'paid',
      confirmedBy: new Types.ObjectId(),
      confirmedAt: confirmedAt.toJSDate(),
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: confirmedAt.toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(1);
  });

  it('неподтверждённая, screenshotAt 91 день назад — уходит', async () => {
    const imageId = await makeScreenshot();
    const screenshotAt = NOW.minus({ days: PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS + 1 });
    const payment = await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-06',
      status: 'awaiting',
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: screenshotAt.toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(0);
    const after = await paymentModel.findById(payment._id).lean();
    expect(after?.status).toBe('awaiting');
    expect(after?.screenshotKind).toBeUndefined();
    expect(after?.screenshotImageId).toBeUndefined();
    expect(after?.screenshotAt).toBeUndefined();
  });

  it('неподтверждённая, screenshotAt 89 дней назад — остаётся', async () => {
    const imageId = await makeScreenshot();
    const screenshotAt = NOW.minus({ days: PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS - 1 });
    await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-07',
      status: 'awaiting',
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: screenshotAt.toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(1);
  });

  it('загружена давно, но подтверждена вчера — остаётся: срок считается от подтверждения, не от загрузки', async () => {
    const imageId = await makeScreenshot();
    const payment = await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-09',
      status: 'paid',
      confirmedBy: new Types.ObjectId(),
      confirmedAt: NOW.minus({ days: 1 }).toJSDate(),
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: NOW.minus({
        days: PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS + 30,
      }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(1);
    const after = await paymentModel.findById(payment._id).lean();
    expect(after?.screenshotKind).toBe('upload');
  });

  it('оплата без снимка — сроками не задевается вовсе', async () => {
    const payment = await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-01',
      status: 'paid',
      confirmedBy: new Types.ObjectId(),
      confirmedAt: NOW.minus({ days: 400 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(0);
    const after = await paymentModel.findById(payment._id).lean();
    expect(after?.status).toBe('paid');
    expect(after?.confirmedAt?.toISOString()).toBe(
      NOW.minus({ days: 400 }).toJSDate().toISOString(),
    );
  });

  it('снимок из бота (kind telegram, без screenshotImageId) — поля снимаются без падения', async () => {
    const confirmedAt = NOW.minus({
      days: PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS + 1,
    });
    const payment = await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-08',
      status: 'paid',
      confirmedBy: new Types.ObjectId(),
      confirmedAt: confirmedAt.toJSDate(),
      screenshotKind: 'telegram',
      screenshotFileId: 'зашифрованный-file-id',
      screenshotFileUniqueId: 'зашифрованный-file-unique-id',
      screenshotAt: confirmedAt.minus({ days: 2 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.removed).toBe(1);
    const after = await paymentModel.findById(payment._id).lean();
    expect(after?.status).toBe('paid');
    expect(after?.screenshotKind).toBeUndefined();
    expect(after?.screenshotFileId).toBeUndefined();
    expect(after?.screenshotFileUniqueId).toBeUndefined();
  });

  it('батч-лимит: больше 50 просроченных за тик — обрабатывается не больше 50, следующий тик доберёт остаток', async () => {
    const dueCount = 55;
    const screenshotAt = NOW.minus({ days: PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS + 1 });
    for (let i = 0; i < dueCount; i += 1) {
      await paymentModel.create({
        userId: new Types.ObjectId(),
        month: '2026-06',
        status: 'awaiting',
        screenshotKind: 'upload',
        screenshotAt: screenshotAt.toJSDate(),
      });
    }

    const first = await service.removeExpired(NOW);
    expect(first.removed).toBe(50);

    const second = await service.removeExpired(NOW.plus({ minutes: 1 }));
    expect(second.removed).toBe(5);

    const stillDue = await paymentModel.countDocuments({
      screenshotKind: { $exists: true },
    });
    expect(stillDue).toBe(0);
  });

  // Байты без ссылки на себя: запись оплаты не состоялась и компенсация в
  // сервисе тоже не сработала, либо две одновременные загрузки одного месяца
  // разошлись на гонке. Ни срок хранения, ни удаление аккаунта до таких байт
  // не добираются — они идут от оплаты (ADR-0050).
  it('снимок старше суток, на который не ссылается ни одна оплата, — уходит', async () => {
    const orphanId = await makeScreenshot(NOW.minus({ hours: 25 }));

    const result = await service.removeExpired(NOW);

    expect(result.orphans).toBe(1);
    expect(result.removed).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: orphanId })).resolves.toBe(0);
  });

  it('снимок без ссылки, но моложе суток — остаётся: оплата могла не дописаться секунду назад', async () => {
    const freshId = await makeScreenshot(NOW.minus({ hours: 23 }));

    const result = await service.removeExpired(NOW);

    expect(result.orphans).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: freshId })).resolves.toBe(1);
  });

  it('снимок старше суток, на который ссылается живая оплата, — не сирота', async () => {
    const imageId = await makeScreenshot(NOW.minus({ days: 3 }));
    await paymentModel.create({
      userId: new Types.ObjectId(),
      month: '2026-09',
      status: 'awaiting',
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      screenshotAt: NOW.minus({ days: 3 }).toJSDate(),
    });

    const result = await service.removeExpired(NOW);

    expect(result.orphans).toBe(0);
    expect(result.removed).toBe(0);
    await expect(screenshotModel.countDocuments({ _id: imageId })).resolves.toBe(1);
  });
});
