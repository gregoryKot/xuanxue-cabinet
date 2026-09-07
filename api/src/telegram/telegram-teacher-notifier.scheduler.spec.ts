// Против настоящей Mongo (CLAUDE.md «Тесты») — notifySchedulerFailed: дедуп
// «не чаще раза в 10 минут на шаг». notifyDeliveryFailed —
// telegram-teacher-notifier.spec.ts.
import {
  buildNotifier,
  clearNotifierTest,
  NOW,
  setupNotifierTest,
  type NotifierTestContext,
} from './telegram-teacher-notifier.test-support';

describe('TelegramTeacherNotifier.notifySchedulerFailed', () => {
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

  it('шлёт при первом сбое шага', async () => {
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifySchedulerFailed('доставки', 'mongo упал', NOW);

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
    expect(bot.sendMessage.mock.calls[0]?.[1]).toContain('доставки');
  });

  it('второй сбой того же шага раньше 10 минут не дублирует', async () => {
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifySchedulerFailed('доставки', 'ошибка 1', NOW);
    await notifier.notifySchedulerFailed(
      'доставки',
      'ошибка 2',
      NOW.plus({ minutes: 5 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('после 10 минут шлёт снова', async () => {
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifySchedulerFailed('доставки', 'ошибка 1', NOW);
    await notifier.notifySchedulerFailed(
      'доставки',
      'ошибка 2',
      NOW.plus({ minutes: 11 }),
    );

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('разные шаги не делят дедуп', async () => {
    const { notifier, bot } = buildNotifier(ctx);

    await notifier.notifySchedulerFailed('доставки', 'x', NOW);
    await notifier.notifySchedulerFailed('рассылки', 'y', NOW.plus({ minutes: 1 }));

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
  });
});
