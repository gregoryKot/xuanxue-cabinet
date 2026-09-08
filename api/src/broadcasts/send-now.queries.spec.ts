// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): запросы
// send-now.queries.ts на уровне функций, не через SendNowService — гонка со
// статусом и реконструкция доставок проверяются напрямую, документом, чей
// статус в базе не совпадает с переданным `existing` (как и требует ревью).
// Happy-path через сервис — send-now.service.spec.ts; здесь — то, что через
// публичный sendNow() воспроизвести детерминированно нельзя без setTimeout
// (CLAUDE.md «Детерминизм»): гонка CAS, исчерпание ретраев, дубль-ключ при
// реконструкции.
import { Types } from 'mongoose';
import type { BroadcastStatus } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import {
  NOW,
  clearSendNowTest,
  createChannel,
  createClass,
  setupSendNowTest,
  type SendNowTestContext,
} from './send-now.service.test-support';
import {
  accelerateSendNowDeliveries,
  allChannelsAlreadySent,
  applySendNowUpdate,
  hasCapturedSendNowDelivery,
  reviveSendNowDeliveries,
  type ExistingSendNowBroadcast,
} from './send-now.queries';

describe('send-now.queries', () => {
  let ctx: SendNowTestContext;

  beforeAll(async () => {
    ctx = await setupSendNowTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearSendNowTest(ctx);
  });

  async function makeBroadcast(
    status: BroadcastStatus,
    channelIds: Types.ObjectId[] = [],
  ) {
    return ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: new Types.ObjectId(),
      channelIds,
      scheduledAt: NOW.toJSDate(),
      text: 'старый текст',
      status,
    });
  }

  describe('hasCapturedSendNowDelivery', () => {
    it('sending — true', async () => {
      const b = await makeBroadcast('scheduled');
      await ctx.deliveryModel.create({
        broadcastId: b._id,
        channelId: new Types.ObjectId(),
        status: 'sending',
      });
      await expect(hasCapturedSendNowDelivery(ctx.deliveryModel, b._id)).resolves.toBe(
        true,
      );
    });

    it('sent — true', async () => {
      const b = await makeBroadcast('scheduled');
      await ctx.deliveryModel.create({
        broadcastId: b._id,
        channelId: new Types.ObjectId(),
        status: 'sent',
      });
      await expect(hasCapturedSendNowDelivery(ctx.deliveryModel, b._id)).resolves.toBe(
        true,
      );
    });

    it('только pending/cancelled/failed — false', async () => {
      const b = await makeBroadcast('scheduled');
      await ctx.deliveryModel.create([
        { broadcastId: b._id, channelId: new Types.ObjectId(), status: 'pending' },
        { broadcastId: b._id, channelId: new Types.ObjectId(), status: 'cancelled' },
        { broadcastId: b._id, channelId: new Types.ObjectId(), status: 'failed' },
      ]);
      await expect(hasCapturedSendNowDelivery(ctx.deliveryModel, b._id)).resolves.toBe(
        false,
      );
    });
  });

  describe('allChannelsAlreadySent', () => {
    it('все переданные каналы sent — true', async () => {
      const b = await makeBroadcast('failed');
      const chA = new Types.ObjectId();
      const chB = new Types.ObjectId();
      await ctx.deliveryModel.create([
        { broadcastId: b._id, channelId: chA, status: 'sent' },
        { broadcastId: b._id, channelId: chB, status: 'sent' },
      ]);
      await expect(
        allChannelsAlreadySent(ctx.deliveryModel, b._id, [chA, chB]),
      ).resolves.toBe(true);
    });

    it('один из каналов не sent — false', async () => {
      const b = await makeBroadcast('failed');
      const chA = new Types.ObjectId();
      const chB = new Types.ObjectId();
      await ctx.deliveryModel.create([
        { broadcastId: b._id, channelId: chA, status: 'sent' },
        { broadcastId: b._id, channelId: chB, status: 'failed' },
      ]);
      await expect(
        allChannelsAlreadySent(ctx.deliveryModel, b._id, [chA, chB]),
      ).resolves.toBe(false);
    });

    it('у канала вовсе нет доставки (новый в списке) — false', async () => {
      const b = await makeBroadcast('failed');
      const chA = new Types.ObjectId();
      const chNew = new Types.ObjectId();
      await ctx.deliveryModel.create({
        broadcastId: b._id,
        channelId: chA,
        status: 'sent',
      });
      await expect(
        allChannelsAlreadySent(ctx.deliveryModel, b._id, [chA, chNew]),
      ).resolves.toBe(false);
    });
  });

  describe('accelerateSendNowDeliveries', () => {
    it('переставляет nextAttemptAt только у pending, sending не трогает', async () => {
      const b = await makeBroadcast('scheduled');
      const later = NOW.plus({ hours: 1 }).toJSDate();
      const [pending, sending] = await ctx.deliveryModel.create([
        {
          broadcastId: b._id,
          channelId: new Types.ObjectId(),
          status: 'pending',
          nextAttemptAt: later,
        },
        {
          broadcastId: b._id,
          channelId: new Types.ObjectId(),
          status: 'sending',
          lockedAt: NOW.toJSDate(),
        },
      ]);
      await accelerateSendNowDeliveries(ctx.deliveryModel, b._id, NOW);
      const pendingAfter = await ctx.deliveryModel.findById(pending?._id).lean();
      const sendingAfter = await ctx.deliveryModel.findById(sending?._id).lean();
      expect(pendingAfter?.nextAttemptAt?.getTime()).toBe(NOW.toJSDate().getTime());
      expect(sendingAfter?.status).toBe('sending');
    });
  });

  describe('reviveSendNowDeliveries', () => {
    it('канал выпал из списка — его failed/pending доставка cancelled', async () => {
      const b = await makeBroadcast('failed');
      const dropped = new Types.ObjectId();
      const kept = new Types.ObjectId();
      const [droppedDelivery] = await ctx.deliveryModel.create([
        { broadcastId: b._id, channelId: dropped, status: 'failed' },
        { broadcastId: b._id, channelId: kept, status: 'failed' },
      ]);
      await reviveSendNowDeliveries(ctx.deliveryModel, b._id, [kept], NOW);
      await expect(
        ctx.deliveryModel.findById(droppedDelivery?._id).lean(),
      ).resolves.toMatchObject({ status: 'cancelled' });
      await expect(
        ctx.deliveryModel.findOne({ broadcastId: b._id, channelId: kept }).lean(),
      ).resolves.toMatchObject({ status: 'pending' });
    });

    it('доставка канала уже sent — не трогаем (дубль-ключ на insert перехвачен)', async () => {
      const b = await makeBroadcast('failed');
      const sentChannel = new Types.ObjectId();
      await ctx.deliveryModel.create({
        broadcastId: b._id,
        channelId: sentChannel,
        status: 'sent',
      });
      await reviveSendNowDeliveries(ctx.deliveryModel, b._id, [sentChannel], NOW);
      await expect(
        ctx.deliveryModel.findOne({ broadcastId: b._id, channelId: sentChannel }).lean(),
      ).resolves.toMatchObject({ status: 'sent' });
    });

    it('канал без доставки — создаётся новая pending', async () => {
      const b = await makeBroadcast('cancelled');
      const freshChannel = new Types.ObjectId();
      await reviveSendNowDeliveries(ctx.deliveryModel, b._id, [freshChannel], NOW);
      await expect(
        ctx.deliveryModel.findOne({ broadcastId: b._id, channelId: freshChannel }).lean(),
      ).resolves.toMatchObject({ status: 'pending' });
    });

    it('insert падает не дубль-ключом — ошибка пробрасывается, не глотается', async () => {
      const b = await makeBroadcast('cancelled');
      const channelId = new Types.ObjectId();
      const spy = jest
        .spyOn(ctx.deliveryModel, 'create')
        .mockRejectedValueOnce(new Error('Mongo недоступна'));

      await expect(
        reviveSendNowDeliveries(ctx.deliveryModel, b._id, [channelId], NOW),
      ).rejects.toThrow('Mongo недоступна');
      spy.mockRestore();
    });
  });

  describe('applySendNowUpdate', () => {
    async function activeChannelAndClass() {
      const channel = await createChannel(ctx);
      const cls = await createClass(ctx, { channelIds: [channel._id] });
      return { channel, cls };
    }

    it('CAS проигрывает гонку — перечитывание видит sent, второй проход бросает 409', async () => {
      const { channel } = await activeChannelAndClass();
      const b = await makeBroadcast('sent', [channel._id]);
      const stale: ExistingSendNowBroadcast = { _id: b._id, status: 'scheduled' };

      await expect(
        applySendNowUpdate(
          ctx.broadcastModel,
          ctx.deliveryModel,
          stale,
          [channel._id],
          'новый текст',
          NOW,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      // Реального документа реконструкция не тронула — CAS не совпал ни разу.
      await expect(ctx.broadcastModel.findById(b._id).lean()).resolves.toMatchObject({
        status: 'sent',
        text: 'старый текст',
      });
    });

    it('перечитывание не находит рассылку — NotFoundError («исчезла между шагами»)', async () => {
      const { channel } = await activeChannelAndClass();
      const stale: ExistingSendNowBroadcast = {
        _id: new Types.ObjectId(), // документа с таким _id нет вовсе
        status: 'scheduled',
      };

      await expect(
        applySendNowUpdate(
          ctx.broadcastModel,
          ctx.deliveryModel,
          stale,
          [channel._id],
          'текст',
          NOW,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('исчезла') as unknown,
      });
    });

    it('гонка не сходится за MAX_STATUS_RACE_RETRIES — 409 с текстом про смену статуса, не про исчезновение', async () => {
      const { channel } = await activeChannelAndClass();
      const b = await makeBroadcast('scheduled', [channel._id]);
      const existing: ExistingSendNowBroadcast = { _id: b._id, status: 'scheduled' };
      // Раннер/второй клик побеждают CAS на каждой попытке подряд — единственный
      // детерминированный способ смоделировать это без setTimeout (CLAUDE.md
      // «Детерминизм»): findById возвращает реальный (совпадающий) статус, но
      // updateOne всегда отвечает «не задело», как будто фильтр не совпал.
      const spy = jest
        .spyOn(ctx.broadcastModel, 'updateOne')
        .mockResolvedValue({ matchedCount: 0 } as never);

      await expect(
        applySendNowUpdate(
          ctx.broadcastModel,
          ctx.deliveryModel,
          existing,
          [channel._id],
          'текст',
          NOW,
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('меняется прямо сейчас') as unknown,
      });
      spy.mockRestore();
    });

    it('все каналы уже sent — 409, статус и доставки не меняются', async () => {
      const { channel } = await activeChannelAndClass();
      const b = await makeBroadcast('failed', [channel._id]);
      await ctx.deliveryModel.create({
        broadcastId: b._id,
        channelId: channel._id,
        status: 'sent',
      });
      const existing: ExistingSendNowBroadcast = { _id: b._id, status: 'failed' };

      await expect(
        applySendNowUpdate(
          ctx.broadcastModel,
          ctx.deliveryModel,
          existing,
          [channel._id],
          'новый текст',
          NOW,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(ctx.broadcastModel.findById(b._id).lean()).resolves.toMatchObject({
        status: 'failed',
      });
    });

    it('доставка захвачена раннером — текст и каналы не меняются, ускоряется только pending', async () => {
      const chA = new Types.ObjectId();
      const chB = new Types.ObjectId();
      const b = await makeBroadcast('scheduled', [chA]);
      await ctx.deliveryModel.create([
        {
          broadcastId: b._id,
          channelId: chA,
          status: 'sending',
          lockedAt: NOW.toJSDate(),
        },
        {
          broadcastId: b._id,
          channelId: chB,
          status: 'pending',
          nextAttemptAt: NOW.plus({ hours: 1 }).toJSDate(),
        },
      ]);
      const existing: ExistingSendNowBroadcast = { _id: b._id, status: 'scheduled' };

      const id = await applySendNowUpdate(
        ctx.broadcastModel,
        ctx.deliveryModel,
        existing,
        [chA, chB],
        'новый текст, который не должен попасть в базу',
        NOW,
      );

      expect(id).toEqual(b._id);
      await expect(ctx.broadcastModel.findById(b._id).lean()).resolves.toMatchObject({
        text: 'старый текст',
        channelIds: [chA],
      });
      const pendingAfter = await ctx.deliveryModel
        .findOne({ broadcastId: b._id, channelId: chB })
        .lean();
      expect(pendingAfter?.nextAttemptAt?.getTime()).toBe(NOW.toJSDate().getTime());
    });
  });
});
