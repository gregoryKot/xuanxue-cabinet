// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): доставка
// снимка бухгалтеру (ADR-0156) — побочный эффект ПОСЛЕ привязки, поэтому её
// проверяем вместе с настоящей записью оплаты: `replaced` берётся из того, что
// уже лежало в базе, а сбой доставки не должен откатить и не должен уронить
// загрузку. Сама отправка в Telegram — telegram/payment-screenshot-to-accountant.spec.ts.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { SettingsService } from '../settings/settings.service';
import type {
  PaymentScreenshotDeliveryPort,
  UploadedScreenshotDelivery,
} from './payment-screenshot-delivery.port';
import { PaymentScreenshotDeliveryRegistry } from './payment-screenshot-delivery.registry';
import { PaymentScreenshotRecord } from './payment-screenshot.schema';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentRecord } from './payment.schema';

const NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('PaymentScreenshotsService: доставка бухгалтеру (ADR-0156)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let screenshotModel: Model<PaymentScreenshotRecord>;
  let paymentModel: Model<PaymentRecord>;
  let registry: PaymentScreenshotDeliveryRegistry;
  let service: PaymentScreenshotsService;
  let error: jest.SpyInstance;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    screenshotModel = connection.model<PaymentScreenshotRecord>(
      PaymentScreenshotRecord.name,
    );
    paymentModel = connection.model<PaymentRecord>(PaymentRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    // Реестр и сервис — на каждый тест: порт из прошлого теста не протекает.
    registry = new PaymentScreenshotDeliveryRegistry();
    service = new PaymentScreenshotsService(
      screenshotModel,
      paymentModel,
      {
        get: () => Promise.resolve({ tz: 'Asia/Jerusalem' }),
      } as unknown as SettingsService,
      registry,
    );
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    error.mockRestore();
    await screenshotModel.deleteMany({});
    await paymentModel.deleteMany({});
  });

  function fakePort(fail = false): {
    port: PaymentScreenshotDeliveryPort;
    calls: UploadedScreenshotDelivery[];
  } {
    const calls: UploadedScreenshotDelivery[] = [];
    const port: PaymentScreenshotDeliveryPort = {
      deliverUploaded: (input) => {
        calls.push(input);
        return fail ? Promise.reject(new Error('порт упал')) : Promise.resolve();
      },
    };
    registry.set(port);
    return { port, calls };
  }

  const student = () => ({
    id: new Types.ObjectId().toString(),
    name: 'Ученик Иванов',
    studentMode: false,
  });

  it('после загрузки порт получает имя, месяц, тип и байты; первая загрузка — replaced: false', async () => {
    const { calls } = fakePort();
    const user = student();

    await service.upload(JPEG_BYTES, user, '2026-09', NOW);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      studentUserId: user.id,
      studentName: 'Ученик Иванов',
      month: '2026-09',
      replaced: false,
      contentType: 'image/jpeg',
      now: NOW,
    });
    expect(calls[0]?.bytes.equals(JPEG_BYTES)).toBe(true);
  });

  it('повторная загрузка за месяц — replaced: true и новые байты', async () => {
    const { calls } = fakePort();
    const user = student();
    await service.upload(JPEG_BYTES, user, '2026-09', NOW);

    await service.upload(PNG_BYTES, user, '2026-09', NOW.plus({ minutes: 5 }));

    expect(calls.map((c) => c.replaced)).toEqual([false, true]);
    expect(calls[1]?.contentType).toBe('image/png');
    expect(calls[1]?.bytes.equals(PNG_BYTES)).toBe(true);
  });

  it('снимок, который раньше прислали боту, — тоже замена (replaced: true)', async () => {
    const { calls } = fakePort();
    const user = student();
    await paymentModel.create({
      userId: user.id,
      month: '2026-09',
      status: 'awaiting',
      screenshotKind: 'telegram',
      screenshotFileId: 'f1',
      screenshotFileUniqueId: 'u1',
    });

    await service.upload(JPEG_BYTES, user, '2026-09', NOW);

    expect(calls[0]?.replaced).toBe(true);
  });

  it('порт бросил — загрузка всё равно успешна, снимок сохранён, error без имени', async () => {
    fakePort(true);
    const user = student();

    const dto = await service.upload(JPEG_BYTES, user, '2026-09', NOW);

    expect(dto).toMatchObject({ status: 'awaiting', hasScreenshot: true });
    const payment = await paymentModel.findOne({ userId: user.id, month: '2026-09' });
    expect(payment?.screenshotKind).toBe('upload');
    await expect(screenshotModel.countDocuments({})).resolves.toBe(1);
    expect(error).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('Ученик Иванов');
  });

  it('порт не собран — загрузка успешна, error с userId и месяцем полями', async () => {
    const user = student();

    const dto = await service.upload(JPEG_BYTES, user, '2026-09', NOW);

    expect(dto.hasScreenshot).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('порт доставки'), {
      userId: user.id,
      month: '2026-09',
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain('Ученик Иванов');
  });

  it('запись оплаты не удалась — доставка не вызывается: бухгалтеру нечего показать', async () => {
    const { calls } = fakePort();
    jest.spyOn(paymentModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw new Error('connection lost');
    });

    await expect(service.upload(JPEG_BYTES, student(), '2026-09', NOW)).rejects.toThrow(
      'connection lost',
    );

    expect(calls).toEqual([]);
  });
});
