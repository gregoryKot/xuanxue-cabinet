// Против настоящей Mongo (mongodb-memory-server, не мок сервисов — CLAUDE.md
// «Тесты»): действия кнопок «Отменить»/«Изменить тему» и общие ошибки —
// маршрутизацию Telegraf проверяет telegram-bot.service.spec.ts, доступ
// (чужой чат, группа, невалидные данные) — callback-query.handler.access.spec.ts.
import { Types } from 'mongoose';
import type { BroadcastsService } from '../../broadcasts/broadcasts.service';
import type { BotSessionService } from '../bot-session.service';
import {
  buildHandler,
  clearCallbackHandlerTest,
  fakeCtx,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';

describe('CallbackQueryHandler — действия кнопок', () => {
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

  it('cancel: — отменяет рассылку, редактирует сообщение', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `cancel:${broadcast._id.toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual(['Отменено. Ссылка не уйдёт.']);
    const updated = await ctx.broadcastModel.findById(broadcast._id).lean();
    expect(updated?.status).toBe('cancelled');
  });

  it('cancel: рассылка уже отправлена — понятная ошибка, не общий текст', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'sent',
    });
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `cancel:${broadcast._id.toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual(['Уже отправлено. Отменить нечего.']);
  });

  it('cancel: неожиданная ошибка сервиса — общий текст, не падает', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const failingBroadcasts = {
      cancel: jest.fn().mockRejectedValue(new Error('mongo упал')),
    } as unknown as BroadcastsService;
    const failingHandler = buildHandler(ctx, { broadcastsService: failingBroadcasts });
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await failingHandler.handle(msgCtx, NOW);

    expect(editCalls).toEqual(['Что-то пошло не так. Попробуйте ещё раз.']);
  });

  it('неожиданная ошибка вне handleCancel/handleTopicButton — лог, общий ответ через reply', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const failingSessions = {
      startTopicWait: jest.fn().mockRejectedValue(new Error('mongo упал')),
    } as unknown as BotSessionService;
    const failingHandler = buildHandler(ctx, { botSessions: failingSessions });
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `topic:${new Types.ObjectId().toString()}`,
    });

    await failingHandler.handle(msgCtx, NOW);

    expect(editCalls).toEqual(['Что-то пошло не так. Попробуйте ещё раз.']);
  });

  it('topic: — заводит ожидание темы, просит написать одним сообщением', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const lessonId = new Types.ObjectId();
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `topic:${lessonId.toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual(['Напишите тему одним сообщением.']);
    const session = await ctx.botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('topic');
    expect(session?.lessonId.toString()).toBe(lessonId.toString());
  });

  it('невалидный id в data — игнорируется, не падает', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx } = fakeCtx({ chatId: 111, data: 'cancel:не-id' });

    await expect(ctx.handler.handle(msgCtx, NOW)).resolves.toBeUndefined();
  });

  it('неизвестное действие — игнорируется', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, 111);
    const { ctx: msgCtx, editCalls } = fakeCtx({
      chatId: 111,
      data: `unknown:${new Types.ObjectId().toString()}`,
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(editCalls).toEqual([]);
  });
});
