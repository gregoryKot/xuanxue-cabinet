// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): байты реально шифруются/расшифровываются (ENCRYPTION_KEY —
// из test/jest.setup.ts, читается один раз при импорте encryption-keys.ts),
// повтор загрузки реально ищет и удаляет старую запись в payment_screenshots,
// а компенсация при упавшей записи оплаты проверена на настоящем findOneAndUpdate,
// не на моке, который пропустил бы ошибку мимо upsertPayment.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  PAYMENT_MONTH_INVALID_MESSAGE,
  PAYMENT_SCREENSHOT_IN_TELEGRAM_MESSAGE,
  PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
  STUDENT_MODE_PAYMENT_MESSAGE,
} from '@xuanxue/shared';
import { ForbiddenError, InvalidInputError, NotFoundError } from '../common/errors';
import { binaryToBuffer } from '../exam-images/exam-image.mapper';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { SettingsService } from '../settings/settings.service';
import { decryptBytes } from '../utils/encryption-bytes';
import { PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE } from './payment-month-window';
import { PaymentScreenshotDeliveryRegistry } from './payment-screenshot-delivery.registry';
import { PaymentScreenshotRecord } from './payment-screenshot.schema';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentRecord } from './payment.schema';

const NOW = DateTime.fromISO('2026-09-18T10:00:00Z', { zone: 'utc' });
const SCHOOL_TZ = 'Asia/Jerusalem';

// Сигнатуры настоящих форматов (exam-image-upload.ts) — сервис распознаёт
// картинку по байтам, не по заголовку, и мусор ни под одну не попадает.
const JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('PaymentScreenshotsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let screenshotModel: Model<PaymentScreenshotRecord>;
  let paymentModel: Model<PaymentRecord>;
  let service: PaymentScreenshotsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    // Схемы уже зарегистрированы openMemoryMongo из MODEL_DEFINITIONS —
    // второй аргумент не нужен (тот же приём, что payments.service.spec.ts).
    screenshotModel = connection.model<PaymentScreenshotRecord>(
      PaymentScreenshotRecord.name,
    );
    paymentModel = connection.model<PaymentRecord>(PaymentRecord.name);
    // Пояс школы — единственное, что сервису нужно от настроек (окно
    // месяцев); фейк вместо Mongo-коллекции настроек: сама SettingsService
    // покрыта своим spec'ом.
    const settingsService = {
      get: () => Promise.resolve({ tz: SCHOOL_TZ }),
    } as unknown as SettingsService;
    service = new PaymentScreenshotsService(
      screenshotModel,
      paymentModel,
      settingsService,
      new PaymentScreenshotDeliveryRegistry(),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await screenshotModel.deleteMany({});
    await paymentModel.deleteMany({});
  });

  function newUserId(): string {
    return new Types.ObjectId().toString();
  }

  // Контроллер передаёт id и имя из сессии (имя — для подписи бухгалтеру, ADR-0156).
  function asStudent(userId: string): {
    id: string;
    name: string;
    studentMode: boolean;
  } {
    return { id: userId, name: 'Ученик', studentMode: false };
  }

  // ADR-0163: снимок из кабинета уходит бухгалтеру как настоящий — в режиме
  // ученика его не принимаем ни байтом: ни записи оплаты, ни байтов в базе.
  it('в режиме ученика — ForbiddenError, оплата и байты не записаны', async () => {
    const userId = newUserId();

    const attempt = service.upload(
      JPEG_BYTES,
      { ...asStudent(userId), studentMode: true },
      '2026-09',
      NOW,
    );

    await expect(attempt).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attempt).rejects.toThrow(STUDENT_MODE_PAYMENT_MESSAGE);
    expect(await paymentModel.countDocuments({})).toBe(0);
    expect(await screenshotModel.countDocuments({})).toBe(0);
  });

  it('загрузка в месяц без документа оплаты: awaiting, kind upload, ответ без байтов и id', async () => {
    const userId = newUserId();

    const dto = await service.upload(JPEG_BYTES, asStudent(userId), '2026-09', NOW);

    expect(dto.status).toBe('awaiting');
    expect(dto.hasScreenshot).toBe(true);
    expect(dto).not.toHaveProperty('bytes');
    expect(dto).not.toHaveProperty('screenshotImageId');
    expect(dto).not.toHaveProperty('screenshotFileId');

    const payment = await paymentModel.findOne({ userId, month: '2026-09' }).lean();
    expect(payment?.status).toBe('awaiting');
    expect(payment?.screenshotKind).toBe('upload');
    expect(payment?.screenshotAt?.toISOString()).toBe(NOW.toJSDate().toISOString());
    expect(payment?.screenshotImageId).toBeDefined();

    const created = await screenshotModel.findById(payment?.screenshotImageId).lean();
    expect(created).not.toBeNull();
    expect(created?.contentType).toBe('image/jpeg');
    expect(created?.sizeBytes).toBe(JPEG_BYTES.length);
  });

  it('байты в payment_screenshots лежат зашифрованными — decryptBytes возвращает исходные', async () => {
    const userId = newUserId();

    await service.upload(JPEG_BYTES, asStudent(userId), '2026-09', NOW);

    const payment = await paymentModel.findOne({ userId, month: '2026-09' }).lean();
    const raw = await screenshotModel.findById(payment?.screenshotImageId).lean();
    const rawBytes = binaryToBuffer(raw?.bytes);

    expect(rawBytes.equals(JPEG_BYTES)).toBe(false);
    expect(decryptBytes(rawBytes).equals(JPEG_BYTES)).toBe(true);
  });

  it('повторная загрузка за тот же месяц: второй абонемент не заводится, старая запись снимка удалена', async () => {
    const userId = newUserId();
    await service.upload(JPEG_BYTES, asStudent(userId), '2026-09', NOW);
    const firstPayment = await paymentModel.findOne({ userId, month: '2026-09' }).lean();
    const firstImageId = firstPayment?.screenshotImageId;

    await service.upload(
      PNG_BYTES,
      asStudent(userId),
      '2026-09',
      NOW.plus({ minutes: 5 }),
    );

    await expect(paymentModel.countDocuments({ userId, month: '2026-09' })).resolves.toBe(
      1,
    );
    const secondPayment = await paymentModel.findOne({ userId, month: '2026-09' }).lean();
    expect(secondPayment?.screenshotImageId?.toString()).not.toBe(
      firstImageId?.toString(),
    );
    await expect(screenshotModel.findById(firstImageId).lean()).resolves.toBeNull();
    const secondImage = await screenshotModel
      .findById(secondPayment?.screenshotImageId)
      .lean();
    expect(secondImage?.contentType).toBe('image/png');
  });

  it('месяц уже подтверждён: новая загрузка меняет снимок, status/confirmedAt не двигаются', async () => {
    const userId = newUserId();
    const accountantId = newUserId();
    const confirmedAt = NOW;
    await paymentModel.create({
      userId,
      month: '2026-09',
      status: 'paid',
      confirmedBy: accountantId,
      confirmedAt: confirmedAt.toJSDate(),
    });

    const dto = await service.upload(
      JPEG_BYTES,
      asStudent(userId),
      '2026-09',
      NOW.plus({ days: 1 }),
    );

    expect(dto.status).toBe('paid');
    expect(dto.confirmedAt).toBe(confirmedAt.toUTC().toISO());
    const payment = await paymentModel.findOne({ userId, month: '2026-09' }).lean();
    expect(payment?.status).toBe('paid');
    expect(payment?.confirmedAt?.toISOString()).toBe(
      confirmedAt.toJSDate().toISOString(),
    );
    expect(payment?.screenshotKind).toBe('upload');
    expect(payment?.screenshotImageId).toBeDefined();
  });

  it.each(['2026-13', '2026-9'])(
    'кривой месяц %s — InvalidInputError, запись в payment_screenshots не появляется',
    async (month) => {
      const userId = newUserId();

      const err = await service
        .upload(JPEG_BYTES, asStudent(userId), month, NOW)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(InvalidInputError);
      expect((err as Error).message).toBe(PAYMENT_MONTH_INVALID_MESSAGE);
      await expect(screenshotModel.countDocuments({})).resolves.toBe(0);
    },
  );

  // Окно месяцев — то же, что у ссылки бота (ADR-0050): месяц в пути
  // подделывается так же, как payload ссылки.
  it('месяц вне окна (2099-12) — InvalidInputError, байты не пишутся', async () => {
    const userId = newUserId();

    const err = await service
      .upload(JPEG_BYTES, asStudent(userId), '2099-12', NOW)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidInputError);
    expect((err as Error).message).toBe(PAYMENT_MONTH_OUT_OF_WINDOW_MESSAGE);
    await expect(screenshotModel.countDocuments({})).resolves.toBe(0);
    await expect(paymentModel.countDocuments({})).resolves.toBe(0);
  });

  it('мусорное тело (не картинка по сигнатуре) — InvalidInputError, запись не остаётся', async () => {
    const userId = newUserId();

    const err = await service
      .upload(Buffer.from('это не картинка'), asStudent(userId), '2026-09', NOW)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidInputError);
    await expect(screenshotModel.countDocuments({})).resolves.toBe(0);
    await expect(paymentModel.countDocuments({})).resolves.toBe(0);
  });

  it('пустое тело — InvalidInputError, запись не остаётся', async () => {
    const userId = newUserId();

    const err = await service
      .upload(Buffer.alloc(0), asStudent(userId), '2026-09', NOW)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(InvalidInputError);
    await expect(screenshotModel.countDocuments({})).resolves.toBe(0);
  });

  it('запись в payments упала — байты только что созданного снимка удаляются, ошибка уходит наверх', async () => {
    const userId = newUserId();
    const dbError = new Error('connection lost');
    // Обёртка вокруг настоящей модели: только findOneAndUpdate ведёт себя
    // иначе, остальные методы (findOne внутри attachUploadedScreenshot) —
    // настоящие, против настоящей Mongo.
    jest.spyOn(paymentModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      throw dbError;
    });

    await expect(
      service.upload(JPEG_BYTES, asStudent(userId), '2026-09', NOW),
    ).rejects.toBe(dbError);

    await expect(screenshotModel.countDocuments({})).resolves.toBe(0);
    await expect(paymentModel.countDocuments({})).resolves.toBe(0);
  });

  describe('load (штат открывает снимок из кабинета, ADR-0149)', () => {
    it('upload → load: исходные байты и тип, не шифротекст', async () => {
      const userId = newUserId();
      await service.upload(PNG_BYTES, asStudent(userId), '2026-09', NOW);

      const loaded = await service.load(userId, '2026-09');

      expect(loaded.bytes.equals(PNG_BYTES)).toBe(true);
      expect(loaded.contentType).toBe('image/png');
    });

    it('повторная загрузка заменила снимок — load отдаёт новый, не старый', async () => {
      const userId = newUserId();
      await service.upload(JPEG_BYTES, asStudent(userId), '2026-09', NOW);
      await service.upload(
        PNG_BYTES,
        asStudent(userId),
        '2026-09',
        NOW.plus({ minutes: 5 }),
      );

      const loaded = await service.load(userId, '2026-09');

      expect(loaded.contentType).toBe('image/png');
      expect(loaded.bytes.equals(PNG_BYTES)).toBe(true);
    });

    it('снимок бота — NotFoundError с текстом про Telegram: байтов у нас нет (ADR-0050)', async () => {
      const userId = newUserId();
      await paymentModel.create({
        userId,
        month: '2026-09',
        status: 'awaiting',
        screenshotKind: 'telegram',
        screenshotFileId: 'f1',
        screenshotFileUniqueId: 'u1',
      });

      const err = await service.load(userId, '2026-09').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).message).toBe(PAYMENT_SCREENSHOT_IN_TELEGRAM_MESSAGE);
    });

    it('нет оплаты за месяц — NotFoundError', async () => {
      await expect(service.load(newUserId(), '2026-09')).rejects.toMatchObject({
        message: PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
        status: 404,
      });
    });

    it('оплата есть, снимка нет — NotFoundError', async () => {
      const userId = newUserId();
      await paymentModel.create({ userId, month: '2026-09', status: 'paid' });

      await expect(service.load(userId, '2026-09')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('снимок другого месяца не подсовывается: месяц в пути — часть ключа', async () => {
      const userId = newUserId();
      await service.upload(JPEG_BYTES, asStudent(userId), '2026-09', NOW);

      await expect(service.load(userId, '2026-08')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('кривой userId — NotFoundError, не CastError (500)', async () => {
      await expect(service.load('не-id', '2026-09')).rejects.toMatchObject({
        message: PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
        status: 404,
      });
    });

    it('кривой месяц — InvalidInputError с текстом про формат', async () => {
      await expect(service.load(newUserId(), '2026-9')).rejects.toMatchObject({
        message: PAYMENT_MONTH_INVALID_MESSAGE,
      });
    });

    it('байты-сироты: ссылка ведёт в никуда — NotFoundError', async () => {
      const userId = newUserId();
      await paymentModel.create({
        userId,
        month: '2026-09',
        status: 'awaiting',
        screenshotKind: 'upload',
        screenshotImageId: new Types.ObjectId(),
      });

      await expect(service.load(userId, '2026-09')).rejects.toMatchObject({
        message: PAYMENT_SCREENSHOT_NOT_FOUND_MESSAGE,
        status: 404,
      });
    });

    it('upload без screenshotImageId (битая запись) — NotFoundError, не падение', async () => {
      const userId = newUserId();
      await paymentModel.create({
        userId,
        month: '2026-09',
        status: 'awaiting',
        screenshotKind: 'upload',
      });

      await expect(service.load(userId, '2026-09')).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
