// Против настоящей Mongo (CLAUDE.md «Тесты») — {время} в тексте
// notifyDeliveryFailed берётся из broadcast.scheduledAt в поясе класса, не
// в сыром UTC (CLAUDE.md «Время»: обязателен тест на переход летнего
// времени Asia/Jerusalem). Остальные случаи notifyDeliveryFailed —
// telegram-teacher-notifier.spec.ts (файл-лимит спеков, CLAUDE.md «Файлы»).
import { DateTime } from 'luxon';
import {
  buildNotifier,
  clearNotifierTest,
  NOW,
  setupNotifierTest,
  type NotifierTestContext,
} from './telegram-teacher-notifier.test-support';

describe('TelegramTeacherNotifier.notifyDeliveryFailed — {время}', () => {
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

  /** Своё занятие на каждый вызов — уникальный индекс (lessonId, kind) не
   * даёт двум broadcast'ам одного kind делить lessonId (второй вызов в
   * пределах одного теста иначе падает на E11000). */
  async function sendFor(scheduledAt: DateTime): Promise<string> {
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
      scheduledAt: scheduledAt.toUTC().toJSDate(),
      text: 'т',
      status: 'failed',
    });
    // target уникален в паре с type — свой на каждый вызов sendFor.
    const channel = await ctx.channelModel.create({
      type: 'telegram',
      title: 'Ученики',
      config: '{}',
      target: `-${scheduledAt.toMillis()}`,
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

    return bot.sendMessage.mock.calls[0]?.[1] as string;
  }

  it('19:00 по Иерусалиму летом (UTC+3) — тексте локальное время, не сырой UTC', async () => {
    const text = await sendFor(
      DateTime.fromObject(
        { year: 2026, month: 9, day: 6, hour: 19, minute: 0 },
        { zone: 'Asia/Jerusalem' },
      ),
    );

    expect(text).toContain('19:00');
  });

  it('переход на зимнее время Asia/Jerusalem (октябрь 2026) — 19:00 остаётся 19:00 по обе стороны', async () => {
    // Занятия по разные стороны перехода — оба «в 19:00 по Иерусалиму»,
    // несмотря на разное смещение от UTC (+3 → +2).
    const beforeDst = DateTime.fromObject(
      { year: 2026, month: 10, day: 20, hour: 19, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    const afterDst = DateTime.fromObject(
      { year: 2026, month: 10, day: 27, hour: 19, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(beforeDst.offset).not.toBe(afterDst.offset); // тест реально пересекает переход

    expect(await sendFor(beforeDst)).toContain('19:00');
    expect(await sendFor(afterDst)).toContain('19:00');
  });
});
