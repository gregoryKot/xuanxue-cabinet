// Против настоящей Mongo (CLAUDE.md «Тесты»): сбои до/вне адаптера
// (broadcast/канал пропали, текст не расшифровался) и cancelled-исходы
// (канал выключили, занятие отменили/удалили) — штатная отправка и повтор
// через адаптер — delivery-runner.service.spec.ts, обвязка — общая
// (delivery-runner.test-support.ts, файл-лимит спеков CLAUDE.md «Файлы»).
import mongoose from 'mongoose';
import type { SendResult } from '../channels/channel-adapter';
import { encryptRecord } from '../utils/encryption';
import { refreshBroadcastStatus } from './delivery-runner.status';
import {
  ENCRYPT_SCHEMA,
  NOW,
  buildRunner,
  clearRunnerTest,
  fakeNotifier,
  seedDelivery,
  setupRunnerTest,
  type RunnerTestContext,
} from './delivery-runner.test-support';

describe('DeliveryRunnerService.run — сбои до адаптера и cancelled', () => {
  let ctx: RunnerTestContext;

  beforeAll(async () => {
    ctx = await setupRunnerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearRunnerTest(ctx);
  });

  it('broadcast за доставкой пропал — доставка failed без повтора, учитель уведомлён', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    const { broadcastId } = await seedDelivery(ctx);
    await ctx.broadcastModel.deleteOne({ _id: broadcastId });

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('failed');
    expect(notifier.calls).toHaveLength(1);
  });

  it('канал за доставкой удалили — доставка failed без повтора, тик не падает целиком', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    const { channelId, broadcastId } = await seedDelivery(ctx);
    await ctx.channelModel.deleteOne({ _id: channelId });

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 1 });
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('failed');
    expect(notifier.calls).toHaveLength(1);
    const broadcast = await ctx.broadcastModel.findById(broadcastId).lean();
    expect(broadcast?.status).toBe('failed');
  });

  it('текст рассылки не расшифровался — failed без повтора, адаптер не зовётся', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    const channel = await ctx.channelConfig.upsertTelegramChat({
      chatId: '@school',
      title: 'Школа',
    });
    // Схема требует непустой text — пустое значение возможно только в обход
    // Mongoose (повреждённые данные, ручная правка в базе), поэтому вставляем
    // через сырой драйвер, а не broadcastModel.create().
    const insertResult = await ctx.broadcastModel.collection.insertOne({
      kind: 'lesson_link',
      channelIds: [new mongoose.Types.ObjectId(channel.id)],
      scheduledAt: NOW.toJSDate(),
      text: '', // decrypt('') → '' — «текст не расшифровался»
      status: 'scheduled',
    });
    await ctx.deliveryModel.create({
      broadcastId: insertResult.insertedId,
      channelId: channel.id,
    });

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(notifier.calls).toHaveLength(1);
  });

  it('канал выключили после создания доставки — cancelled, не failed, без уведомления', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    const { channelId, broadcastId } = await seedDelivery(ctx);
    await ctx.channelModel.updateOne({ _id: channelId }, { $set: { active: false } });

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(notifier.calls).toHaveLength(0);
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('cancelled');
    expect(delivery?.lockedAt).toBeUndefined();
    const broadcast = await ctx.broadcastModel.findById(broadcastId).lean();
    // Единственная доставка отменена — рассылка тоже cancelled (см. отдельный
    // тест ниже на случай, когда отменена только часть доставок).
    expect(broadcast?.status).toBe('cancelled');
  });

  it('занятие рассылки отменили между планированием и отправкой — доставка и broadcast cancelled', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    const channel = await ctx.channelConfig.upsertTelegramChat({
      chatId: '@school',
      title: 'Школа',
    });
    const lesson = await ctx.lessonModel.create({
      classId: new mongoose.Types.ObjectId(),
      startsAt: NOW.toJSDate(),
      durationMin: 60,
      status: 'cancelled',
    });
    const broadcast = await ctx.broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [channel.id],
          scheduledAt: NOW.toJSDate(),
          text: 'через 10 минут занятие',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    await ctx.deliveryModel.create({ broadcastId: broadcast._id, channelId: channel.id });

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(notifier.calls).toHaveLength(0);
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('cancelled');
    const stored = await ctx.broadcastModel.findById(broadcast._id).lean();
    expect(stored?.status).toBe('cancelled');
  });

  it('занятие рассылки удалили между планированием и отправкой — тоже cancelled', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const runner = buildRunner(ctx, { type: 'telegram', send }, fakeNotifier());
    const channel = await ctx.channelConfig.upsertTelegramChat({
      chatId: '@school',
      title: 'Школа',
    });
    const broadcast = await ctx.broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: new mongoose.Types.ObjectId(), // занятия с таким id уже нет
          channelIds: [channel.id],
          scheduledAt: NOW.toJSDate(),
          text: 'через 10 минут занятие',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    await ctx.deliveryModel.create({ broadcastId: broadcast._id, channelId: channel.id });

    await runner.run(NOW);

    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('cancelled');
  });

  it('refreshBroadcastStatus: одна доставка cancelled, другая sent — broadcast всё равно sent', async () => {
    const broadcastId = new mongoose.Types.ObjectId();
    await ctx.deliveryModel.create([
      { broadcastId, channelId: new mongoose.Types.ObjectId(), status: 'cancelled' },
      { broadcastId, channelId: new mongoose.Types.ObjectId(), status: 'sent' },
    ]);
    await ctx.broadcastModel.create({
      _id: broadcastId,
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'scheduled',
    });

    await refreshBroadcastStatus(ctx.deliveryModel, ctx.broadcastModel, broadcastId, NOW);

    const broadcast = await ctx.broadcastModel.findById(broadcastId).lean();
    expect(broadcast?.status).toBe('sent');
  });

  it('refreshBroadcastStatus не переигрывает уже cancelled рассылку — sent-доставки её не поднимают', async () => {
    const broadcastId = new mongoose.Types.ObjectId();
    // Учитель отменил рассылку (POST /broadcasts/:id/cancel), но одна
    // доставка была уже 'sending' в момент отмены и всё равно ушла —
    // refreshBroadcastStatus после её исхода не должен вернуть 'sent'.
    await ctx.deliveryModel.create({
      broadcastId,
      channelId: new mongoose.Types.ObjectId(),
      status: 'sent',
    });
    await ctx.broadcastModel.create({
      _id: broadcastId,
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'cancelled',
    });

    await refreshBroadcastStatus(ctx.deliveryModel, ctx.broadcastModel, broadcastId, NOW);

    const broadcast = await ctx.broadcastModel.findById(broadcastId).lean();
    expect(broadcast?.status).toBe('cancelled');
  });

  it('рассылку отменили ровно между захватом доставки и preflight — доставка cancelled, адаптер не зовётся, broadcast остаётся cancelled', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    const { broadcastId } = await seedDelivery(ctx);
    // Раннер уже забрал доставку на прошлой миллисекунде (claimDelivery), а
    // POST /broadcasts/:id/cancel случился прямо перед тем, как run() дошёл
    // до preflight этой же доставки — status: 'cancelled' уже в базе.
    await ctx.broadcastModel.updateOne(
      { _id: broadcastId },
      { $set: { status: 'cancelled' } },
    );

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(notifier.calls).toHaveLength(0);
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('cancelled');
    expect(delivery?.lockedAt).toBeUndefined();
    const broadcast = await ctx.broadcastModel.findById(broadcastId).lean();
    expect(broadcast?.status).toBe('cancelled');
  });
});
