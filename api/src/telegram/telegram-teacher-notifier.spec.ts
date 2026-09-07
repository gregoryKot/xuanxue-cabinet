// Против настоящей Mongo (CLAUDE.md «Тесты») — notifyDeliveryFailed: резолв
// «{класс} {время}»/названия канала. notifySchedulerFailed и его дедуп —
// telegram-teacher-notifier.scheduler.spec.ts.
import { Types } from 'mongoose';
import {
  buildNotifier,
  clearNotifierTest,
  fakeTeacherChats,
  NOW,
  setupNotifierTest,
  type NotifierTestContext,
} from './telegram-teacher-notifier.test-support';

describe('TelegramTeacherNotifier.notifyDeliveryFailed', () => {
  let ctx: NotifierTestContext;

  beforeAll(async () => {
    ctx = await setupNotifierTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearNotifierTest(ctx);
  });

  it('«{класс} {время}» в канал «{название}»: ошибка', async () => {
    const cls = await ctx.classModel.create({
      title: 'цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
    const lesson = await ctx.lessonModel.create({
      classId: cls._id,
      startsAt: NOW.toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'failed',
    });
    const channel = await ctx.channelModel.create({
      type: 'telegram',
      title: 'Ученики',
      config: '{}',
      target: '-1',
    });
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifyDeliveryFailed(
      {
        deliveryId: 'd1',
        broadcastId: broadcast._id.toString(),
        channelId: channel._id.toString(),
        error: 'чат не найден',
      },
      NOW,
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = bot.sendMessage.mock.calls[0] as [string, string];
    expect(chatId).toBe('111');
    expect(text).toContain('цигун для глаз');
    expect(text).toContain('Ученики');
    expect(text).toContain('чат не найден');
  });

  it('без lessonId (разовая рассылка) — «Разовая рассылка»', async () => {
    const broadcast = await ctx.broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'failed',
    });
    const channel = await ctx.channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifyDeliveryFailed(
      {
        deliveryId: 'd1',
        broadcastId: broadcast._id.toString(),
        channelId: channel._id.toString(),
        error: 'x',
      },
      NOW,
    );

    const text = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(text).toContain('Разовая рассылка');
  });

  it('lessonId есть, но занятие уже удалено — «Разовая рассылка»', async () => {
    const cls = await ctx.classModel.create({
      title: 'x',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
    const lesson = await ctx.lessonModel.create({
      classId: cls._id,
      startsAt: NOW.toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    const broadcast = await ctx.broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'failed',
    });
    await ctx.lessonModel.deleteOne({ _id: lesson._id });
    const channel = await ctx.channelModel.create({
      type: 'telegram',
      title: 'Ученики',
      config: '{}',
      target: '-1',
    });
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifyDeliveryFailed(
      {
        deliveryId: 'd1',
        broadcastId: broadcast._id.toString(),
        channelId: channel._id.toString(),
        error: 'x',
      },
      NOW,
    );

    const text = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(text).toContain('Разовая рассылка');
  });

  it('канал уже удалён — «канал удалён» вместо названия', async () => {
    const broadcast = await ctx.broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'failed',
    });
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifyDeliveryFailed(
      {
        deliveryId: 'd1',
        broadcastId: broadcast._id.toString(),
        channelId: new Types.ObjectId().toString(),
        error: 'x',
      },
      NOW,
    );

    const text = bot.sendMessage.mock.calls[0]?.[1] as string;
    expect(text).toContain('канал удалён');
  });

  it('ни одного учителя не подключено — лог, не бросает', async () => {
    const broadcast = await ctx.broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'failed',
    });
    const channel = await ctx.channelModel.create({
      type: 'manual',
      title: 'Facebook',
      config: '{}',
      target: '',
    });
    const { notifier, bot } = buildNotifier(ctx, fakeTeacherChats([]));

    await expect(
      notifier.notifyDeliveryFailed(
        {
          deliveryId: 'd1',
          broadcastId: broadcast._id.toString(),
          channelId: channel._id.toString(),
          error: 'x',
        },
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
});
