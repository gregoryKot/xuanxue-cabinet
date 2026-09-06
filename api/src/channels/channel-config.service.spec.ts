// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// расшифровка config для адаптера и идемпотентный upsertTelegramChat —
// потребители этих двух методов вынесены из ChannelsService (channels.service.spec.ts).
import type { Connection, Model } from 'mongoose';
import { ChannelConfigService } from './channel-config.service';
import { ChannelRecord, ChannelSchema } from './channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('ChannelConfigService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ChannelRecord>;
  let service: ChannelConfigService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    // Уникальный индекс (type, target) строится в фоне — без явного ожидания
    // тест на гонку двух upsertTelegramChat иногда бежал бы без него
    // (мигающий тест, тот же урок, что в users.service.spec.ts).
    await model.syncIndexes();
    service = new ChannelConfigService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it('readConfig: расшифровывает config, возвращает тип и объект', async () => {
    const created = await service.upsertTelegramChat({
      chatId: '@school',
      title: 'Школа',
    });

    const { type, config } = await service.readConfig(created.id);

    expect(type).toBe('telegram');
    expect(config).toEqual({ chatId: '@school' });
  });

  it('readConfig: невалидный ObjectId — NotFoundError, не CastError', async () => {
    await expect(service.readConfig('не-валидный-id')).rejects.toThrow('не найден');
  });

  it('readConfig: канала нет — NotFoundError', async () => {
    await expect(service.readConfig('507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найден',
    );
  });

  it('upsertTelegramChat: второй вызов с тем же chatId не создаёт второй документ', async () => {
    const first = await service.upsertTelegramChat({ chatId: '@school', title: 'Школа' });
    const second = await service.upsertTelegramChat({
      chatId: '@school',
      title: 'Школа',
    });

    expect(first.id).toBe(second.id);
    expect(await model.countDocuments({ type: 'telegram', target: '@school' })).toBe(1);
  });

  it('upsertTelegramChat: гонка двух одновременных вызовов — один документ', async () => {
    const [first, second] = await Promise.all([
      service.upsertTelegramChat({ chatId: '@race', title: 'Первый' }),
      service.upsertTelegramChat({ chatId: '@race', title: 'Второй' }),
    ]);

    expect(first.id).toBe(second.id);
    expect(await model.countDocuments({ type: 'telegram', target: '@race' })).toBe(1);
  });

  it('upsertTelegramChat: пустой chatId — InvalidInputError, ничего не создаётся', async () => {
    await expect(
      service.upsertTelegramChat({ chatId: '', title: 'Без chatId' }),
    ).rejects.toThrow('chatId');
    expect(await model.countDocuments({ type: 'telegram' })).toBe(0);
  });

  it('upsertTelegramChat: E11000, но документ не находится (защита в глубину) — пробрасывает исходную ошибку', async () => {
    // В реальной Mongo E11000 без найденного документа невозможен — это
    // защитная ветка на случай гонки удаления между insert и findOne.
    // Мокаем оба вызова на реальной модели, чтобы её проверить изолированно.
    const duplicateErr = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
    });
    jest.spyOn(model, 'create').mockRejectedValueOnce(duplicateErr);
    jest.spyOn(model, 'findOne').mockReturnValueOnce({
      select: () => ({ lean: () => Promise.resolve(null) }),
    } as never);

    await expect(
      service.upsertTelegramChat({ chatId: '@ghost', title: 'x' }),
    ).rejects.toBe(duplicateErr);

    jest.restoreAllMocks();
  });
});
