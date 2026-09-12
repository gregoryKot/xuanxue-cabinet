// Против настоящей Mongo (CLAUDE.md «Тесты»): расширенное окно предпросмотра
// (decideBroadcast + sendLessonBroadcast, PLAN.md §6) — scheduledAt/
// nextAttemptAt доставок равны моменту фактической отправки (startsAt −
// leadMinutes), не моменту создания документа; DeliveryRunnerService не
// берёт доставку раньше своего часа — read-after-write через настоящий
// раннер, не только проверка поля в базе. Базовое поведение тика —
// broadcast-planner.service.spec.ts (файл-лимит спеков, CLAUDE.md «Файлы»).
import type { ConfigService } from '@nestjs/config';
import { DEFAULT_PREVIEW_MINUTES } from '@xuanxue/shared';
import type { SendResult } from '../channels/channel-adapter';
import { ChannelAdapterRegistry } from '../channels/channel-adapter.registry';
import { ChannelConfigService } from '../channels/channel-config.service';
import { ManualAdapter } from '../channels/manual.adapter';
import { decrypt } from '../utils/encryption';
import type { TeacherNotifier } from '../deliveries/teacher-notifier';
import { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import { SettingsRecord } from '../settings/settings.schema';
import {
  clearPlannerTest,
  createClass,
  createLesson,
  NOW,
  setupPlannerTest,
  type PlannerTestContext,
} from './broadcast-planner.service.test-support';

function fakeConfig(): ConfigService {
  return { get: () => 'bot-token' } as unknown as ConfigService;
}

function fakeNotifier(): TeacherNotifier {
  return {
    notifyDeliveryFailed: () => Promise.resolve(),
    notifySchedulerFailed: () => Promise.resolve(),
    notifyBroadcastCancelled: () => Promise.resolve(),
  };
}

function buildRunner(ctx: PlannerTestContext, send: jest.Mock): DeliveryRunnerService {
  const channelConfig = new ChannelConfigService(ctx.channelModel, ctx.classModel);
  const registry = new ChannelAdapterRegistry([
    { type: 'telegram', send },
    new ManualAdapter(),
  ]);
  return new DeliveryRunnerService(
    ctx.deliveryModel,
    ctx.broadcastModel,
    ctx.lessonModel,
    channelConfig,
    registry,
    fakeConfig(),
    fakeNotifier(),
  );
}

describe('BroadcastPlannerService.plan — расширенное окно предпросмотра', () => {
  let ctx: PlannerTestContext;

  beforeAll(async () => {
    ctx = await setupPlannerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearPlannerTest(ctx);
  });

  it('занятие в расширенном окне: scheduledAt/nextAttemptAt = startsAt − lead; раннер берёт только по наступлении момента', async () => {
    const cls = await createClass(ctx); // leadMinutes: 30
    // startsAt = now + lead + 3 мин — в окне (верхняя граница now + lead +
    // DEFAULT_PREVIEW_MINUTES — школа без документа настроек в этом тесте),
    // но раньше самого момента отправки на 3 минуты: сейчас только предпросмотр.
    const startsAt = NOW.plus({ minutes: 30 + 3 });
    expect(30 + 3).toBeLessThanOrEqual(30 + DEFAULT_PREVIEW_MINUTES); // сценарий реально в окне
    const lesson = await createLesson(ctx, cls._id, startsAt.toJSDate());

    const planResult = await ctx.service.plan(NOW);
    expect(planResult).toEqual({ broadcasts: 1 });

    const sendAt = startsAt.minus({ minutes: 30 });
    const broadcast = await ctx.broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.scheduledAt?.toISOString()).toBe(sendAt.toUTC().toISO());
    const delivery = await ctx.deliveryModel
      .findOne({ broadcastId: broadcast?._id })
      .lean();
    expect(delivery?.nextAttemptAt?.toISOString()).toBe(sendAt.toUTC().toISO());

    // read-after-write: раннер на этот тик ничего не отправляет — момент
    // отправки ещё не настал (nextAttemptAt в будущем).
    const send = jest
      .fn<Promise<SendResult>, unknown[]>()
      .mockResolvedValue({ status: 'sent' });
    const runner = buildRunner(ctx, send);
    await expect(runner.run(NOW)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();

    // На сам момент отправки (sendAt) раннер её забирает и шлёт.
    await expect(runner.run(sendAt)).resolves.toEqual({ sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const sent = await ctx.deliveryModel.findOne({ broadcastId: broadcast?._id }).lean();
    expect(sent?.status).toBe('sent');
  });

  it('текст рендерится на момент фактической отправки — «через 30 минут», не «через 33»', async () => {
    const cls = await createClass(ctx); // leadMinutes: 30
    const startsAt = NOW.plus({ minutes: 30 + 3 });
    await createLesson(ctx, cls._id, startsAt.toJSDate());

    await ctx.service.plan(NOW);

    const broadcast = await ctx.broadcastModel.findOne({}).lean();
    const text = decrypt(broadcast?.text);
    expect(text).toContain('Через 30 минут');
    expect(text).not.toContain('Через 33 минут');
  });

  it('догоняющий тик (startsAt = now + 10, lead 30) — рендер на now, не на sendAt из прошлого', async () => {
    const cls = await createClass(ctx); // leadMinutes: 30
    // sendAt = startsAt − 30 = now − 20 — уже в прошлом: тик опоздал.
    const startsAt = NOW.plus({ minutes: 10 });
    await createLesson(ctx, cls._id, startsAt.toJSDate());

    const result = await ctx.service.plan(NOW);
    expect(result).toEqual({ broadcasts: 1 });

    const broadcast = await ctx.broadcastModel.findOne({}).lean();
    const text = decrypt(broadcast?.text);
    // Реально до занятия 10 минут — не «через 30» (leadMinutes) и не
    // отрицательное число (sendAt в прошлом).
    expect(text).toContain('Через 10 минут');
  });

  // ТЗ preview-minutes.md: previewMinutes — настройка школы, не константа —
  // окно тика реально шире/уже вместе с ней, не только
  // decideBroadcast в отрыве от Mongo (broadcast-planner.decide.spec.ts).
  it('previewMinutes школы шире дефолта — занятие в расширенном окне создаёт broadcast раньше', async () => {
    await ctx.connection.model(SettingsRecord.name).create({
      _id: 'school',
      templates: { lessonLink: 'через {минут} минут', recording: 'запись' },
      tz: 'Asia/Jerusalem',
      previewMinutes: 20,
    });
    const cls = await createClass(ctx); // leadMinutes: 30
    // now + lead + 12 — вне дефолтного окна предпросмотра (30 + 5), но
    // внутри окна school.previewMinutes = 20 (30 + 20).
    const startsAt = NOW.plus({ minutes: 30 + 12 });
    expect(30 + 12).toBeGreaterThan(30 + DEFAULT_PREVIEW_MINUTES);
    await createLesson(ctx, cls._id, startsAt.toJSDate());

    const result = await ctx.service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
  });
});
