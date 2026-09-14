// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кнопка-
// тумблер «Уведомления» (ТЗ notifications-delivery.md §3). cancel/topic,
// norec/sent и общий доступ — соседние callback-query.handler.*.spec.ts.
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

describe('CallbackQueryHandler — notif (Уведомления)', () => {
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

  it('notif:post_draft на дефолте (включено) — выключает, перерисовывает то же сообщение', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'notif:post_draft' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toHaveLength(1);
    expect(editCalls[0]).toContain('Черновик поста — выключено');

    const user = await ctx.userModel.findOne({ telegramId: 111 }).lean();
    const prefs = await ctx.notificationPrefsModel
      .findOne({ userId: user?._id.toString() })
      .lean();
    expect(prefs?.overrides).toEqual([{ kind: 'post_draft', enabled: false }]);
  });

  it('второе нажатие той же кнопки — включает обратно (read-after-write)', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const first = fakeCtx({ chatId: 111, data: 'notif:post_draft' });
    await ctx.handler.handle(first.ctx, NOW);

    const second = fakeCtx({ chatId: 111, data: 'notif:post_draft' });
    await ctx.handler.handle(second.ctx, NOW);

    expect(second.editCalls[0]).toContain('Черновик поста — включено');
  });

  it('редактирует только у того, кто нажал — другой учитель не задет', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    await seedTeacher(ctx.userModel, ctx.channelModel, 222);
    const { ctx: cbCtx } = fakeCtx({ chatId: 111, data: 'notif:post_draft' });

    await ctx.handler.handle(cbCtx, NOW);

    const other = await ctx.userModel.findOne({ telegramId: 222 }).lean();
    const otherPrefs = await ctx.notificationPrefsModel
      .findOne({ userId: other?._id.toString() })
      .lean();
    expect(otherPrefs).toBeNull();
  });

  it('пользователь отвязан между проверкой доступа и резолвом (гонка) — тихо игнорируется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const missingUserService = {
      findByTelegramId: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;
    const handler = buildHandler(ctx, { usersService: missingUserService });
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'notif:post_draft' });

    await expect(handler.handle(cbCtx, NOW)).resolves.toBeUndefined();

    expect(editCalls).toEqual([]);
  });

  it('notif с чужим/битым параметром (не вид уведомления) — игнорируется, не падает', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'notif:не-вид' });

    await expect(ctx.handler.handle(cbCtx, NOW)).resolves.toBeUndefined();

    expect(editCalls).toEqual([]);
  });
});
