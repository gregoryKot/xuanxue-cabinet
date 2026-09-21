// Против настоящей Mongo (CLAUDE.md «Тесты») — условный апдейт
// manualPromptedAt ДО отправки, текст+название канала; PersonalChats/бот —
// фейки.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { PersonalChat } from '../telegram/personal-chats';
import type { TelegramBotService } from '../telegram/telegram-bot.service';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from '../broadcasts/broadcast.schema';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';
import { ManualPromptService } from './manual-prompt.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);
const CHAT: PersonalChat = { chatId: '111', userId: 'u1', name: 'Мария' };

function fakePersonalChats(chats: PersonalChat[] = [CHAT]) {
  return { list: jest.fn().mockResolvedValue(chats) };
}

function fakeBot(): {
  sendMessage: jest.Mock<Promise<void>, [string, string, unknown[][]?]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<void>, [string, string, unknown[][]?]>()
      .mockResolvedValue(undefined),
  };
}

describe('ManualPromptService.prompt', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let deliveryModel: Model<DeliveryRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      deliveryModel.deleteMany({}),
      broadcastModel.deleteMany({}),
      channelModel.deleteMany({}),
    ]);
  });

  async function seedManualDelivery(overrides: Partial<DeliveryRecord> = {}) {
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'manual',
          channelIds: [channel._id],
          scheduledAt: NOW.toJSDate(),
          text: 'Готовый текст для Facebook',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    const delivery = await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: channel._id,
      status: 'manual',
      ...overrides,
    });
    return { delivery, broadcast, channel };
  }

  function build(personalChats = fakePersonalChats(), bot = fakeBot()) {
    const service = new ManualPromptService(
      deliveryModel,
      broadcastModel,
      channelModel,
      personalChats as never,
      bot as unknown as TelegramBotService,
    );
    return { service, bot };
  }

  it('доставка manual без manualPromptedAt — шлёт текст+кнопку, ставит manualPromptedAt', async () => {
    const { delivery, channel } = await seedManualDelivery();
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 1 });
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, buttons] = bot.sendMessage.mock.calls[0] as [
      string,
      string,
      unknown,
    ];
    expect(chatId).toBe('111');
    expect(text).toContain(channel.title);
    expect(text).toContain('Готовый текст для Facebook');
    expect(buttons).toEqual([
      [
        {
          text: 'Скопировал, отправил',
          callback_data: `sent:${delivery._id.toString()}`,
        },
      ],
    ]);
    const updated = await deliveryModel.findById(delivery._id).lean();
    expect(updated?.manualPromptedAt).toBeInstanceOf(Date);
  });

  it('manualPromptedAt уже стоит — повторно не шлёт', async () => {
    await seedManualDelivery({ manualPromptedAt: NOW.minus({ minutes: 1 }).toJSDate() });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('статус не manual — не подхватывает', async () => {
    await seedManualDelivery({ status: 'pending' });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('ни одного учителя не подключено — не забирает и не ставит manualPromptedAt (иначе тик подключения теряет доставку навсегда)', async () => {
    const { delivery } = await seedManualDelivery();
    const { service, bot } = build(fakePersonalChats([]));

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await deliveryModel.findById(delivery._id).lean();
    expect(updated?.manualPromptedAt).toBeUndefined();
  });

  it('гонка двух тиков на одной доставке — сообщение уходит один раз, prompted суммарно 1', async () => {
    const { delivery } = await seedManualDelivery();
    const bot = fakeBot();
    const personalChats = fakePersonalChats();
    const serviceA = new ManualPromptService(
      deliveryModel,
      broadcastModel,
      channelModel,
      personalChats as never,
      bot as unknown as TelegramBotService,
    );
    const serviceB = new ManualPromptService(
      deliveryModel,
      broadcastModel,
      channelModel,
      personalChats as never,
      bot as unknown as TelegramBotService,
    );

    const [resultA, resultB] = await Promise.all([
      serviceA.prompt(NOW),
      serviceB.prompt(NOW),
    ]);

    expect(resultA.prompted + resultB.prompted).toBe(1);
    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const updated = await deliveryModel.findById(delivery._id).lean();
    expect(updated?.manualPromptedAt).toBeInstanceOf(Date);
  });

  it('канал удалён — не шлёт, но и не бросает', async () => {
    const { delivery, channel } = await seedManualDelivery();
    await channelModel.deleteOne({ _id: channel._id });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await deliveryModel.findById(delivery._id).lean();
    expect(updated?.manualPromptedAt).toBeInstanceOf(Date);
  });

  it('текст не расшифровался — не шлёт', async () => {
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const { insertedId: broadcastId } = await connection
      .collection('broadcasts')
      .insertOne({
        kind: 'manual',
        channelIds: [channel._id],
        scheduledAt: NOW.toJSDate(),
        text: '',
        status: 'scheduled',
      });
    const delivery = await deliveryModel.create({
      broadcastId,
      channelId: channel._id,
      status: 'manual',
    });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 0 });
    expect(bot.sendMessage).not.toHaveBeenCalled();
    const updated = await deliveryModel.findById(delivery._id).lean();
    expect(updated?.manualPromptedAt).toBeInstanceOf(Date);
  });

  // Аудит 2026-09-21 (HIGH): claim стоял без try/catch — упади findById
  // канала (сетевой блип к Mongo) на одной доставке, весь цикл prompt()
  // рвался, и claim этой доставки оставался стоять навсегда. claimAndRun
  // это чинит: падение изолировано на одном элементе.
  it('findById канала бросил на одной доставке — вторая всё равно обработана, manualPromptedAt на упавшей снят', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { delivery: a } = await seedManualDelivery();
    const { delivery: b } = await seedManualDelivery();
    const findByIdSpy = jest
      .spyOn(channelModel, 'findById')
      .mockImplementationOnce(() => {
        throw new Error('сетевой блип к Mongo');
      });
    const { service, bot } = build();

    const result = await service.prompt(NOW);

    expect(result).toEqual({ prompted: 1 }); // упавшая доставка не в счёте
    expect(bot.sendMessage).toHaveBeenCalledTimes(1); // цикл не прервался
    expect(errorSpy).toHaveBeenCalled();

    const [aAfter, bAfter] = await Promise.all([
      deliveryModel.findById(a._id).lean(),
      deliveryModel.findById(b._id).lean(),
    ]);
    const marked = [aAfter, bAfter].filter((doc) => doc?.manualPromptedAt);
    const unmarked = [aAfter, bAfter].filter((doc) => !doc?.manualPromptedAt);
    expect(marked).toHaveLength(1); // успешная — отметка стоит
    expect(unmarked).toHaveLength(1); // упавшая — claim снят следующему тику

    errorSpy.mockRestore();
    findByIdSpy.mockRestore();
  });
});
