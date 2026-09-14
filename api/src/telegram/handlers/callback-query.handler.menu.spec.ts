// Против настоящей Mongo (CLAUDE.md «Тесты»): кнопки главного меню бота —
// переход правкой того же сообщения, а не новой копией меню в чате.
import type { UsersService } from '../../users/users.service';
import {
  buildHandler,
  clearCallbackHandlerTest,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';
import { fakeCtx } from './callback-query.handler.fake-ctx';

describe('CallbackQueryHandler — menu (главное меню)', () => {
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

  it('menu:schedule — экран занятий правит то же сообщение', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'menu:schedule' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]).toContain('Ближайших занятий нет.');
  });

  it('menu:notifications — экран уведомлений с кнопкой возврата', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: 'menu:notifications',
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('Черновик поста — включено');
  });

  it('menu:back — возвращает в главное меню', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'menu:back' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('/topic');
  });

  it('чужой экран в параметре — молча игнорируется, сообщение не трогается', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: 'menu:делай-что-хочешь',
    });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toHaveLength(0);
  });

  // Гонка: доступ проверен по каналу, а запись пользователя успели удалить
  // («Ученики» → «Удалить данные»). Экран уведомлений строить не из чего —
  // молчим, а не падаем.
  it('пользователь пропал между проверкой доступа и отрисовкой — сообщение не трогается', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    // Подменяем только резолв userId: доступ по-прежнему проверяется
    // настоящим PersonalChats (тот же приём, что в спеке тумблеров).
    const handler = buildHandler(ctx, {
      usersService: {
        findByTelegramId: () => Promise.resolve(null),
      } as unknown as UsersService,
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: 'menu:notifications',
    });

    await handler.handle(cbCtx, NOW);

    expect(editCalls).toHaveLength(0);
  });

  it('сообщение уже нельзя править — бот не падает, ошибку глотает', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: 'menu:back',
      failEdit: true,
    });

    await expect(ctx.handler.handle(cbCtx, NOW)).resolves.toBeUndefined();

    expect(editCalls).toHaveLength(0);
  });
});
