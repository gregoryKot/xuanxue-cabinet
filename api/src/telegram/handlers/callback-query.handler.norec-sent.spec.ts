// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// «Записи не будет» и «Скопировал, отправил». cancel/topic и общий доступ —
// callback-query.handler.spec.ts.
import { Types } from 'mongoose';
import {
  clearCallbackHandlerTest,
  fakeCtx,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';

describe('CallbackQueryHandler — norec/sent', () => {
  let ctx: CallbackHandlerTestContext;

  beforeAll(async () => {
    ctx = await setupCallbackHandlerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearCallbackHandlerTest(ctx);
  });

  it('norec: — закрывает ожидание записи, подтверждает', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonId = new Types.ObjectId();
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `norec:${lessonId.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Хорошо, записи не будет.']);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });

  it('norec: два «Запись?» подряд — «Записи не будет» под первым не гасит ожидание второго', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonA = new Types.ObjectId();
    const lessonB = new Types.ObjectId();
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'recording',
      lessonId: lessonA,
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    // Второй вопрос вытесняет первый как активную сессию чата (один документ
    // на чат, bot-session.schema.ts) — «Записи не будет» под A всё равно
    // должно найти свой lessonId в callback data, не текущую сессию чата.
    await ctx.botSessionModel.updateOne({ chatId: 111 }, { $set: { lessonId: lessonB } });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `norec:${lessonA.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Хорошо, записи не будет.']);
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.lessonId?.toString()).toBe(lessonB.toString());
  });

  it('norec: без активного ожидания — тоже отвечает (idempotent)', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `norec:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Хорошо, записи не будет.']);
  });

  it('sent: — отмечает доставку отправленной, редактирует сообщение', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const manualChannel = await ctx.channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const broadcast = await ctx.broadcastModel.create({
      kind: 'manual',
      channelIds: [manualChannel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    const delivery = await ctx.deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: manualChannel._id,
      status: 'manual',
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `sent:${delivery._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Отмечено: отправлено.']);
    const updated = await ctx.deliveryModel.findById(delivery._id).lean();
    expect(updated?.status).toBe('sent');
  });

  it('sent: уже отмечено (двойной клик) — понятная ошибка', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const manualChannel = await ctx.channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const broadcast = await ctx.broadcastModel.create({
      kind: 'manual',
      channelIds: [manualChannel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'sent',
    });
    const delivery = await ctx.deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: manualChannel._id,
      status: 'sent',
      sentAt: NOW.toJSDate(),
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `sent:${delivery._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Уже отправлено.']);
  });

  it('sent: доставка не найдена — понятная ошибка', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `sent:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Доставка не найдена. Откройте журнал рассылок.']);
  });

  it('sent: рассылку отменили — «Рассылка отменена, отправлять не нужно.»', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const manualChannel = await ctx.channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const broadcast = await ctx.broadcastModel.create({
      kind: 'manual',
      channelIds: [manualChannel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'cancelled',
    });
    const delivery = await ctx.deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: manualChannel._id,
      status: 'cancelled',
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `sent:${delivery._id.toString()}`,
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Рассылка отменена, отправлять не нужно.']);
  });
});
