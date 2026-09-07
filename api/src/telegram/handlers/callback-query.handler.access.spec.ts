// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// может нажимать кнопки (chatId, from, личный чат, TeacherChats) и невалидные
// callback data. Сами действия кнопок — callback-query.handler.spec.ts.
import { Types } from 'mongoose';
import {
  clearCallbackHandlerTest,
  fakeCtx,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';

describe('CallbackQueryHandler — доступ', () => {
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

  it('нет ctx.chat (chatId неизвестен) — тихо выходит', async () => {
    const { ctx: msgCtx, editCalls } = fakeCtx({
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual([]);
  });

  it('callback из группы (не личный чат) — тихо игнорируется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      chatType: 'group',
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual([]);
  });

  it('нет ctx.from (identity неизвестна) — тихо выходит', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      noFrom: true,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual([]);
  });

  it('чат не совпадает ни с одним учителем (список непустой) — тихо игнорируется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 222,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual([]);
  });

  it('чужой чат (не в TeacherChats) — тихо игнорируется, БД не трогает', async () => {
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 999,
      data: `cancel:${broadcast._id.toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual([]);
    const untouched = await ctx.broadcastModel.findById(broadcast._id).lean();
    expect(untouched?.status).toBe('scheduled');
  });

  it('нет callback_query.data — тихо выходит', async () => {
    const { ctx: msgCtx } = fakeCtx({ chatId: 111 });
    await expect(ctx.handler.handle(msgCtx, NOW)).resolves.toBeUndefined();
  });

  it('answerCbQuery зовётся всегда, даже для чужого чата', async () => {
    const { ctx: msgCtx } = fakeCtx({
      chatId: 999,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });
    const spy = jest.spyOn(msgCtx, 'answerCbQuery');

    await ctx.handler.handle(msgCtx, NOW);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
