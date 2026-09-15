// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// расшифровка config для адаптера и идемпотентный upsertTelegramChat —
// потребители этих двух методов вынесены из ChannelsService (channels.service.spec.ts).
// Подключение канала ко всем активным классам (ADR-0015) — за это отвечает
// classModel, тот же приём, что в classes.service.spec.ts (реальная Mongo,
// не мок модели: мок пропустил бы ошибку в самом $addToSet).
import type { Connection, Model, Types } from 'mongoose';
import { CHANNEL_LIMITS } from '@xuanxue/shared';
import { ChannelConfigService } from './channel-config.service';
import { ChannelRecord, ChannelSchema } from './channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('ChannelConfigService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let service: ChannelConfigService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    // Уникальный индекс (type, target) строится в фоне — без явного ожидания
    // тест на гонку двух upsertTelegramChat иногда бежал бы без него
    // (мигающий тест, тот же урок, что в users.service.spec.ts).
    await model.syncIndexes();
    service = new ChannelConfigService(model, classModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await classModel.deleteMany({});
  });

  it('readConfig: расшифровывает config, возвращает тип, объект и active', async () => {
    const created = await service.upsertTelegramChat({
      chatId: '@school',
      title: 'Школа',
    });

    const { type, config, active } = await service.readConfig(created.id);

    expect(type).toBe('telegram');
    expect(config).toEqual({ chatId: '@school' });
    expect(active).toBe(true);
  });

  it('readConfig: выключенный канал — active: false (раннер отменяет доставку, не failed)', async () => {
    const created = await service.upsertTelegramChat({
      chatId: '@off',
      title: 'Выключенный',
    });
    await model.updateOne({ _id: created.id }, { $set: { active: false } });

    const { active } = await service.readConfig(created.id);

    expect(active).toBe(false);
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

  it('upsertTelegramChat: create() прошёл, но findById не находит документ (защита в глубину) — NotFoundError', async () => {
    // Гонка между insert и повторным чтением того же _id — в реальной Mongo
    // невозможна, но защитная ветка должна бросать понятную ошибку, а не
    // молча вернуть undefined в toChannelDto.
    jest.spyOn(model, 'findById').mockReturnValueOnce({
      select: () => ({ lean: () => Promise.resolve(null) }),
    } as never);

    await expect(
      service.upsertTelegramChat({ chatId: '@vanished', title: 'x' }),
    ).rejects.toThrow('не найден');

    jest.restoreAllMocks();
  });

  it('upsertTelegramChat: подключает канал ко всем активным классам, неактивный не трогает', async () => {
    const active = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });
    const inactive = await classModel.create({
      title: 'Архив',
      format: 'online',
      active: false,
    });

    const channel = await service.upsertTelegramChat({
      chatId: '@group',
      title: 'Группа учеников',
    });

    const activeAfter = await classModel.findById(active._id).lean<{
      channelIds: Types.ObjectId[];
    }>();
    const inactiveAfter = await classModel.findById(inactive._id).lean<{
      channelIds: Types.ObjectId[];
    }>();
    expect(activeAfter?.channelIds.map(String)).toContain(channel.id);
    expect(inactiveAfter?.channelIds).toHaveLength(0);
  });

  it('upsertTelegramChat: повторный вызов не переподключает классы — ни старый (учитель отключил руками), ни новый активный', async () => {
    const original = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });
    const channel = await service.upsertTelegramChat({
      chatId: '@twice',
      title: 'Группа',
    });
    // Учитель вручную отключил класс от чата в кабинете — повторное
    // добавление бота не должно это решение отменять (ADR-0015).
    await classModel.updateOne(
      { _id: original._id },
      { $pull: { channelIds: channel.id } },
    );
    const appeared = await classModel.create({
      title: 'Появился после первого раза',
      format: 'online',
      active: true,
    });

    await service.upsertTelegramChat({ chatId: '@twice', title: 'Группа' });

    const originalAfter = await classModel
      .findById(original._id)
      .lean<{ channelIds: Types.ObjectId[] }>();
    const appearedAfter = await classModel
      .findById(appeared._id)
      .lean<{ channelIds: Types.ObjectId[] }>();
    expect(originalAfter?.channelIds).toHaveLength(0);
    expect(appearedAfter?.channelIds).toHaveLength(0);
  });

  it('upsertTelegramChat: чат вернулся после kicked — active снова true, title обновлён', async () => {
    const created = await service.upsertTelegramChat({
      chatId: '@revive',
      title: 'Старое название',
    });
    await service.deactivateTelegramChat('@revive');

    const revived = await service.upsertTelegramChat({
      chatId: '@revive',
      title: 'Новое название',
    });

    expect(revived.id).toBe(created.id);
    expect(revived.active).toBe(true);
    expect(revived.title).toBe('Новое название');
  });

  it('upsertTelegramChat: название чата длиннее CHANNEL_LIMITS.title — обрезается', async () => {
    const longTitle = 'Ч'.repeat(200);

    const created = await service.upsertTelegramChat({
      chatId: '@long',
      title: longTitle,
    });

    expect(created.title).toHaveLength(CHANNEL_LIMITS.title);
  });

  it('deactivateTelegramChat: active — false, документ остаётся', async () => {
    const created = await service.upsertTelegramChat({
      chatId: '@kicked',
      title: 'Кикнутый чат',
    });

    await service.deactivateTelegramChat('@kicked');

    const doc = await model.findById(created.id).lean<{ active: boolean }>();
    expect(doc?.active).toBe(false);
  });

  it('deactivateTelegramChat: неизвестный chatId — не создаёт документ, не падает', async () => {
    await expect(service.deactivateTelegramChat('@unknown')).resolves.toBeUndefined();
    expect(await model.countDocuments({ type: 'telegram' })).toBe(0);
  });

  it('listActiveTelegramChatIds: только активные telegram-каналы, выключенный не попадает', async () => {
    await service.upsertTelegramChat({ chatId: '@active', title: 'Активный' });
    await service.upsertTelegramChat({ chatId: '@off', title: 'Выключенный' });
    await service.deactivateTelegramChat('@off');

    const chatIds = await service.listActiveTelegramChatIds();

    expect(chatIds).toEqual(['@active']);
  });

  it('listActiveTelegramChatIds: каналов нет — пустой список, не падает', async () => {
    await expect(service.listActiveTelegramChatIds()).resolves.toEqual([]);
  });

  it('listActiveTelegramChatIds: личный канал ученика (broadcastEligible: false) не попадает (ADR-0027)', async () => {
    await service.upsertTelegramChat({ chatId: '@group', title: 'Группа' });
    await service.upsertPersonalTelegramChat({ chatId: '555', title: 'x' });

    await expect(service.listActiveTelegramChatIds()).resolves.toEqual(['@group']);
  });

  describe('upsertPersonalTelegramChat (ADR-0027 — личный канал ученика)', () => {
    it('создаёт активный канал, не подключает его ни к одному классу', async () => {
      const active = await classModel.create({
        title: 'Тайцзицюань',
        format: 'online',
        active: true,
      });

      const created = await service.upsertPersonalTelegramChat({
        chatId: '555',
        title: 'Личные сообщения: Ольга',
      });

      expect(created.active).toBe(true);
      const doc = await model.findById(created.id).lean<{ broadcastEligible: boolean }>();
      expect(doc?.broadcastEligible).toBe(false);
      const activeAfter = await classModel.findById(active._id).lean<{
        channelIds: Types.ObjectId[];
      }>();
      expect(activeAfter?.channelIds).toHaveLength(0);
    });

    it('второй вызов с тем же chatId — не создаёт второй документ, оживляет active:true', async () => {
      const first = await service.upsertPersonalTelegramChat({
        chatId: '555',
        title: 'Ольга',
      });
      await service.deactivateTelegramChat('555');

      const second = await service.upsertPersonalTelegramChat({
        chatId: '555',
        title: 'Ольга',
      });

      expect(second.id).toBe(first.id);
      expect(second.active).toBe(true);
      expect(await model.countDocuments({ type: 'telegram', target: '555' })).toBe(1);
    });
  });
});
