// Против настоящей Mongo (CLAUDE.md «Тесты»): кнопки главного меню бота —
// переход правкой того же сообщения, а не новой копией меню в чате.
import { ACCESS_MESSAGE } from '@xuanxue/shared';
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

  // ТЗ 4б.3 (docs/PLAN.md §12) — «Новый вопрос» в главном меню — screen 1
  // диалога, тот же рендер, что у команды /вопрос (kindSelectScreen).
  it('menu:newitem — screen 1 «Новый вопрос», правит то же сообщение', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'menu:newitem' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('Выберите тип ответа');
  });

  // ТЗ 4б.4 (docs/PLAN.md §12) — «Собрать экзамен» в главном меню — шаг
  // 'pick' диалога; фейковый ExamBotPort по умолчанию отдаёт пустой список,
  // поэтому здесь честное «нет опубликованных вопросов», не заведённая сессия.
  it('menu:newexam — нет опубликованных вопросов, правит то же сообщение с действием', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 111, data: 'menu:newexam' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('Нет опубликованных вопросов');
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

  // Ученик не штат школы (PersonalChats.list его не видит), но «Экзамены» и
  // «В меню» открыты и ему (ADR-0027, docs/PLAN.md §11 слой 4.7) — той же
  // причиной, что и у самих кнопок экзамена: сдающий не обязан быть штатом.
  it('menu:exams — открыт ученику (без ролей штата), не только штату', async () => {
    await ctx.userModel.create({ name: 'Ольга', telegramId: 777, roles: [] });
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 777, data: 'menu:exams' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toHaveLength(1);
  });

  it('menu:back — ученику показывает его меню (Экзамены), не штатное («Ближайшие занятия»)', async () => {
    await ctx.userModel.create({ name: 'Ольга', telegramId: 778, roles: [] });
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 778, data: 'menu:back' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('Экзамены можно сдать');
    expect(editCalls[0]).not.toContain('/topic');
  });

  it('menu:back — заблокированный получает отказ, не меню', async () => {
    await ctx.userModel.create({
      name: 'Ольга',
      telegramId: 779,
      roles: [],
      status: 'blocked',
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 779, data: 'menu:back' });

    await ctx.handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual([ACCESS_MESSAGE]);
  });

  it('menu:exams/menu:back — незнакомец молча игнорируется', async () => {
    const { ctx: cbCtx, editCalls } = fakeCtx({ chatId: 780, data: 'menu:back' });

    await ctx.handler.handle(cbCtx, NOW);

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
