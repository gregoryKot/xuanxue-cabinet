// Против настоящей Mongo (CLAUDE.md «Тесты»): захват под гонкой, повторы,
// идемпотентность двух тиков — всё это про реальный findOneAndUpdate и
// реальный уникальный индекс, мок модели такое не ловит. Сбои до адаптера и
// cancelled-исходы — delivery-runner.cancellation.spec.ts (файл-лимит спеков,
// CLAUDE.md «Файлы»), обвязка обоих файлов — delivery-runner.test-support.ts.
import mongoose from 'mongoose';
import type { SendResult } from '../channels/channel-adapter';
import { decrypt } from '../utils/encryption';
import { refreshBroadcastStatus } from './delivery-runner.status';
import {
  BOT_TOKEN,
  NOW,
  buildRunner,
  clearRunnerTest,
  fakeNotifier,
  seedDelivery,
  setupRunnerTest,
  type RunnerTestContext,
} from './delivery-runner.test-support';

describe('DeliveryRunnerService.run', () => {
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

  it('успешная отправка — delivery sent, broadcast sent, повторный тик молчит', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>().mockResolvedValue({
      status: 'sent',
      externalId: 'msg-1',
    });
    const runner = buildRunner(ctx, { type: 'telegram', send }, fakeNotifier());
    const { broadcastId } = await seedDelivery(ctx);

    const first = await runner.run(NOW);
    expect(first).toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);

    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('sent');
    expect(delivery?.externalId).toBe('msg-1');
    const broadcast = await ctx.broadcastModel.findById(broadcastId).lean();
    expect(broadcast?.status).toBe('sent');

    // Идемпотентность: второй тик не находит уже отправленную доставку.
    const second = await runner.run(NOW.plus({ minutes: 1 }));
    expect(second).toEqual({ sent: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('повтор через 2 и 10 минут, потом уведомление учителю', async () => {
    const send = jest
      .fn<Promise<SendResult>, unknown[]>()
      .mockResolvedValueOnce({ status: 'failed', error: 'таймаут', retryable: true })
      .mockResolvedValueOnce({ status: 'failed', error: 'таймаут', retryable: true })
      .mockResolvedValueOnce({ status: 'failed', error: 'таймаут', retryable: true });
    const notifier = fakeNotifier();
    const runner = buildRunner(ctx, { type: 'telegram', send }, notifier);
    await seedDelivery(ctx);

    await runner.run(NOW);
    let delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('pending');
    expect(delivery?.attempts).toBe(1);
    expect(delivery?.nextAttemptAt?.toISOString()).toBe(NOW.plus({ minutes: 2 }).toISO());

    // Раньше времени повтора — раннер доставку не берёт.
    await runner.run(NOW.plus({ minutes: 1 }));
    expect(send).toHaveBeenCalledTimes(1);

    await runner.run(NOW.plus({ minutes: 2 }));
    delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('pending');
    expect(delivery?.attempts).toBe(2);
    expect(delivery?.nextAttemptAt?.toISOString()).toBe(
      NOW.plus({ minutes: 12 }).toISO(),
    );
    expect(notifier.calls).toHaveLength(0);

    await runner.run(NOW.plus({ minutes: 12 }));
    delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('failed');
    expect(delivery?.attempts).toBe(3);
    expect(notifier.calls).toHaveLength(1);
    const broadcast = await ctx.broadcastModel.findOne({}).lean();
    expect(broadcast?.status).toBe('failed');
  });

  it('гонка Promise.all двух run() — только одна отправка', async () => {
    const send = jest
      .fn<Promise<SendResult>, unknown[]>()
      .mockResolvedValue({ status: 'sent' });
    const runner = buildRunner(ctx, { type: 'telegram', send }, fakeNotifier());
    await seedDelivery(ctx);

    const [a, b] = await Promise.all([runner.run(NOW), runner.run(NOW)]);

    expect(a.sent + b.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('sent');
  });

  it('manual — доставка manual, broadcast остаётся scheduled до кнопки «отметить отправленным»', async () => {
    // upsertTelegramChat создаёт только telegram; для manual создаём напрямую.
    const manualChannel = await ctx.channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [manualChannel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'текст поста',
      status: 'scheduled',
    });
    await ctx.deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: manualChannel._id,
    });

    const runner = buildRunner(
      ctx,
      { type: 'telegram', send: jest.fn() },
      fakeNotifier(),
    );
    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 0 });
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('manual');
    const stored = await ctx.broadcastModel.findById(broadcast._id).lean();
    // manual больше не закрывает broadcast сама — ждёт mark-sent.
    expect(stored?.status).toBe('scheduled');
  });

  it('зависший sending старше 10 минут — повторный тик подбирает его снова', async () => {
    const send = jest
      .fn<Promise<SendResult>, unknown[]>()
      .mockResolvedValue({ status: 'sent' });
    const runner = buildRunner(ctx, { type: 'telegram', send }, fakeNotifier());
    await seedDelivery(ctx);
    await ctx.deliveryModel.updateOne(
      {},
      { $set: { status: 'sending', lockedAt: NOW.minus({ minutes: 11 }).toJSDate() } },
    );

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 1, failed: 0 });
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('sent');
  });

  it('свежий sending (моложе 10 минут) — тик его не трогает', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>();
    const runner = buildRunner(ctx, { type: 'telegram', send }, fakeNotifier());
    await seedDelivery(ctx);
    await ctx.deliveryModel.updateOne(
      {},
      { $set: { status: 'sending', lockedAt: NOW.minus({ minutes: 3 }).toJSDate() } },
    );

    const result = await runner.run(NOW);

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    const delivery = await ctx.deliveryModel.findOne({}).lean();
    expect(delivery?.status).toBe('sending');
  });

  it('scrub: токен бота в ошибке не долетает до записи в базу, error зашифрован', async () => {
    const send = jest.fn<Promise<SendResult>, unknown[]>().mockResolvedValue({
      status: 'failed',
      error: `Telegram отклонил: bot${BOT_TOKEN} не найден`,
      retryable: false,
    });
    const runner = buildRunner(ctx, { type: 'telegram', send }, fakeNotifier());
    await seedDelivery(ctx);

    await runner.run(NOW);

    const delivery = await ctx.deliveryModel.findOne({}).lean();
    // Сырое поле в Mongo — не текст ошибки вовсе (зашифровано целиком), а не
    // только «без токена»: без шифрования тест ниже читал бы то же самое, что
    // decrypt() вернул бы для незашифрованной строки один в один.
    expect(delivery?.error).not.toContain('не найден');
    expect(delivery?.error).not.toContain(BOT_TOKEN);
    const storedError = decrypt(delivery?.error);
    expect(storedError).not.toContain(BOT_TOKEN);
    expect(storedError).toContain('[секрет]');
    expect(storedError).toContain('не найден');
  });

  it('refreshBroadcastStatus: рассылка без доставок — не трогает broadcast', async () => {
    const orphanId = new mongoose.Types.ObjectId();
    await expect(
      refreshBroadcastStatus(ctx.deliveryModel, ctx.broadcastModel, orphanId, NOW),
    ).resolves.toBeUndefined();
  });
});
