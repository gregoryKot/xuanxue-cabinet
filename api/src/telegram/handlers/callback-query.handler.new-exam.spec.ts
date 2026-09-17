// Против настоящей Mongo (CLAUDE.md «Тесты»): диспетчер CallbackQueryHandler
// доводит net/nep/nea/nel/nen/nef до routeNewExamCallback (ТЗ 4б.4) — саму
// механику шагов проверяют new-exam-callback.spec.ts и интеграционный
// new-exam-flow.spec.ts, здесь только маршрутизация через настоящий хендлер.
import {
  clearCallbackHandlerTest,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';
import { fakeCtx } from './callback-query.handler.fake-ctx';

describe('CallbackQueryHandler — собрать экзамен (диспетчер)', () => {
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

  it('nef:cancel доходит до routeNewExamCallback — черновик сборки очищается', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    await ctx.botSessionModel.create({
      chatId: 111,
      kind: 'examBuildDraft',
      buildStep: 'pick',
      buildItemIds: [],
      expiresAt: NOW.plus({ hours: 1 }).toJSDate(),
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'nef:cancel' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Экзамен не собран. Черновик отменён.']);
    expect(await ctx.botSessionModel.findOne({ chatId: 111 })).toBeNull();
  });

  it('не штат — молча игнорируется, черновик не трогается', async () => {
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 999, data: 'nef:cancel' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual([]);
  });
});
