// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// расшифровка config для адаптера и идемпотентный upsertTelegramChat —
// потребители этих двух методов вынесены из ChannelsService (channels.service.spec.ts).
// Бот сам занятия к каналу не подключает — новый канал без группы (ADR-0195).
import { Types, type Connection, type Model } from 'mongoose';
import { CHANNEL_LIMITS } from '@xuanxue/shared';
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

  it('upsertTelegramChat: новый канал без группы — занятия сюда не идут, пока учитель не выберет (ADR-0195)', async () => {
    const channel = await service.upsertTelegramChat({
      chatId: '@group',
      title: 'Группа учеников',
    });

    expect(channel.groupIds).toEqual([]);
  });

  it('upsertTelegramChat: повторный вызов не отменяет группу, выбранную учителем', async () => {
    const channel = await service.upsertTelegramChat({
      chatId: '@twice',
      title: 'Группа',
    });
    const groupId = new Types.ObjectId();
    await model.updateOne({ _id: channel.id }, { $set: { groupIds: [groupId] } });

    const again = await service.upsertTelegramChat({ chatId: '@twice', title: 'Группа' });

    expect(again.groupIds).toEqual([groupId.toString()]);
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
    expect((await model.findById(revived.id).lean())?.active).toBe(true);
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

  describe('upsertPersonalTelegramChat (ADR-0027 — личный канал ученика)', () => {
    it('создаёт активный канал без группы', async () => {
      const created = await service.upsertPersonalTelegramChat({
        chatId: '555',
        title: 'Личные сообщения: Ольга',
      });

      expect((await model.findById(created.id).lean())?.active).toBe(true);
      const doc = await model.findById(created.id).lean<{ broadcastEligible: boolean }>();
      expect(doc?.broadcastEligible).toBe(false);
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
      expect((await model.findById(second.id).lean())?.active).toBe(true);
      expect(await model.countDocuments({ type: 'telegram', target: '555' })).toBe(1);
    });
  });
});
