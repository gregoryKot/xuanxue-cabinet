// Против настоящей Mongo (CLAUDE.md «Тесты») — notifyBroadcastCancelled:
// резолв «{класс} {время}» через broadcastName (как у notifyDeliveryFailed),
// текст по причине и «класс выключен» — без DM. Дедуп (teacherNotifiedAt) и
// признак «автоматический плейсхолдер» — broadcast-cancel-notify.service.spec.ts,
// тексты по каждой причине — broadcast-cancel-message.spec.ts.
import { CANCEL_REASON } from '../broadcasts/broadcast-cancel-reasons';
import {
  buildNotifier,
  clearNotifierTest,
  fakeTeacherChats,
  NOW,
  setupNotifierTest,
  type NotifierTestContext,
} from './telegram-teacher-notifier.test-support';

describe('TelegramTeacherNotifier.notifyBroadcastCancelled', () => {
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

  async function makeCancelledBroadcast() {
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
      status: 'cancelled',
    });
    return broadcast;
  }

  it('нет каналов — DM с именем класса+временем и действием', async () => {
    const broadcast = await makeCancelledBroadcast();
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifyBroadcastCancelled(
      {
        broadcastId: broadcast._id.toString(),
        lessonId: broadcast.lessonId?.toString(),
        reason: CANCEL_REASON.noChannels,
      },
      NOW,
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = bot.sendMessage.mock.calls[0] as [string, string];
    expect(chatId).toBe('111');
    expect(text).toContain('цигун для глаз');
    expect(text).toContain('«Расписании»');
  });

  it('класс выключен — DM не шлём (осознанное решение учителя)', async () => {
    const broadcast = await makeCancelledBroadcast();
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifyBroadcastCancelled(
      {
        broadcastId: broadcast._id.toString(),
        lessonId: broadcast.lessonId?.toString(),
        reason: CANCEL_REASON.classDisabled,
      },
      NOW,
    );

    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('причина без сформулированного действия — DM не шлём, не падает', async () => {
    const broadcast = await makeCancelledBroadcast();
    const { notifier, bot } = buildNotifier(ctx);

    await expect(
      notifier.notifyBroadcastCancelled(
        {
          broadcastId: broadcast._id.toString(),
          lessonId: broadcast.lessonId?.toString(),
          reason: 'рассылка записи не создалась: mongo упал',
        },
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('ни одного учителя не подключено — лог, не бросает', async () => {
    const broadcast = await makeCancelledBroadcast();
    const { notifier, bot } = buildNotifier(ctx, fakeTeacherChats([]));

    await expect(
      notifier.notifyBroadcastCancelled(
        {
          broadcastId: broadcast._id.toString(),
          lessonId: broadcast.lessonId?.toString(),
          reason: CANCEL_REASON.noLink,
        },
        NOW,
      ),
    ).resolves.toBeUndefined();
    expect(bot.sendMessage).not.toHaveBeenCalled();
  });
});
