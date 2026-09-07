// Юнит-тест на фейках шагов (CLAUDE.md «Тесты»: детерминизм — без
// setTimeout-ожиданий, свой resolve() вместо реальных часов).
import { DateTime } from 'luxon';
import type { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import type { PreviewService } from '../broadcasts/preview.service';
import type { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import type { ManualPromptService } from '../deliveries/manual-prompt.service';
import type { TeacherNotifier } from '../deliveries/teacher-notifier';
import type { LessonPlannerService, PlanResult } from '../lessons/lesson-planner.service';
import type { RecordingPromptService } from '../lessons/recording-prompt.service';
import { SchedulerService } from './scheduler.service';

function buildService(overrides: {
  plan?: LessonPlannerService['plan'];
  planBroadcasts?: BroadcastPlannerService['plan'];
  runDeliveries?: DeliveryRunnerService['run'];
  sendPreviews?: PreviewService['sendPending'];
  promptRecordings?: RecordingPromptService['prompt'];
  promptManual?: ManualPromptService['prompt'];
  notifySchedulerFailed?: TeacherNotifier['notifySchedulerFailed'];
}): {
  service: SchedulerService;
  // Отдельная ссылка на мок, не `notifier.notifySchedulerFailed` — иначе
  // eslint (@typescript-eslint/unbound-method) ругается на вызов метода в
  // отрыве от объекта в expect() ниже.
  notifySchedulerFailed: jest.Mock;
} {
  const plan = overrides.plan ?? jest.fn().mockResolvedValue({ created: 0, removed: 0 });
  const planBroadcasts =
    overrides.planBroadcasts ?? jest.fn().mockResolvedValue({ broadcasts: 0 });
  const runDeliveries =
    overrides.runDeliveries ?? jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
  const sendPreviews =
    overrides.sendPreviews ?? jest.fn().mockResolvedValue({ claimed: 0 });
  const promptRecordings =
    overrides.promptRecordings ?? jest.fn().mockResolvedValue({ prompted: 0 });
  const promptManual =
    overrides.promptManual ?? jest.fn().mockResolvedValue({ prompted: 0 });
  const notifySchedulerFailed =
    overrides.notifySchedulerFailed ?? jest.fn().mockResolvedValue(undefined);
  const notifier: TeacherNotifier = {
    notifyDeliveryFailed: jest.fn().mockResolvedValue(undefined),
    notifySchedulerFailed,
  };
  const service = new SchedulerService(
    { plan } as unknown as LessonPlannerService,
    { plan: planBroadcasts } as unknown as BroadcastPlannerService,
    { run: runDeliveries } as unknown as DeliveryRunnerService,
    { sendPending: sendPreviews } as unknown as PreviewService,
    { prompt: promptRecordings } as unknown as RecordingPromptService,
    { prompt: promptManual } as unknown as ManualPromptService,
    notifier,
  );
  return { service, notifySchedulerFailed: notifySchedulerFailed as jest.Mock };
}

describe('SchedulerService.tick', () => {
  it('зовёт все шаги с одним DateTime, не бросает', async () => {
    const plan = jest.fn((_now: DateTime): Promise<PlanResult> =>
      Promise.resolve({ created: 2, removed: 1 }),
    );
    const planBroadcasts = jest.fn(
      (_now: DateTime): ReturnType<BroadcastPlannerService['plan']> =>
        Promise.resolve({ broadcasts: 3 }),
    );
    const runDeliveries = jest.fn(
      (_now: DateTime): ReturnType<DeliveryRunnerService['run']> =>
        Promise.resolve({ sent: 4, failed: 1 }),
    );
    const sendPreviews = jest.fn(
      (_now: DateTime): ReturnType<PreviewService['sendPending']> =>
        Promise.resolve({ claimed: 2 }),
    );
    const promptRecordings = jest.fn(
      (_now: DateTime): ReturnType<RecordingPromptService['prompt']> =>
        Promise.resolve({ prompted: 1 }),
    );
    const promptManual = jest.fn(
      (_now: DateTime): ReturnType<ManualPromptService['prompt']> =>
        Promise.resolve({ prompted: 1 }),
    );
    const { service } = buildService({
      plan,
      planBroadcasts,
      runDeliveries,
      sendPreviews,
      promptRecordings,
      promptManual,
    });

    await expect(service.tick()).resolves.toBeUndefined();

    expect(plan).toHaveBeenCalledTimes(1);
    expect(planBroadcasts).toHaveBeenCalledTimes(1);
    expect(runDeliveries).toHaveBeenCalledTimes(1);
    expect(sendPreviews).toHaveBeenCalledTimes(1);
    expect(promptRecordings).toHaveBeenCalledTimes(1);
    expect(promptManual).toHaveBeenCalledTimes(1);
    const [calledWith] = plan.mock.calls[0] ?? [];
    expect(calledWith).toBeInstanceOf(DateTime);
    // Все шаги делят один now — рассылка не может считать «позже», чем видел
    // планировщик занятий в этом же тике.
    expect(planBroadcasts.mock.calls[0]?.[0]).toBe(calledWith);
    expect(runDeliveries.mock.calls[0]?.[0]).toBe(calledWith);
    expect(sendPreviews.mock.calls[0]?.[0]).toBe(calledWith);
    expect(promptRecordings.mock.calls[0]?.[0]).toBe(calledWith);
    expect(promptManual.mock.calls[0]?.[0]).toBe(calledWith);
  });

  it('ошибка шага рассылок не останавливает шаг доставок и предпросмотра', async () => {
    const planBroadcasts = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const sendPreviews = jest.fn().mockResolvedValue({ claimed: 0 });
    const { service } = buildService({ planBroadcasts, runDeliveries, sendPreviews });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(runDeliveries).toHaveBeenCalledTimes(1);
    expect(sendPreviews).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага занятий не останавливает остальные шаги', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const planBroadcasts = jest.fn().mockResolvedValue({ broadcasts: 0 });
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const { service } = buildService({ plan, planBroadcasts, runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(planBroadcasts).toHaveBeenCalledTimes(1);
    expect(runDeliveries).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага предпросмотра не мешает итоговому логу', async () => {
    const sendPreviews = jest.fn().mockRejectedValue(new Error('бот молчит'));
    const { service } = buildService({ sendPreviews });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага доставок не мешает итоговому логу', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const { service } = buildService({ runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('ошибка шага «запись» не останавливает шаг ручных каналов', async () => {
    const promptRecordings = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const promptManual = jest.fn().mockResolvedValue({ prompted: 0 });
    const { service } = buildService({ promptRecordings, promptManual });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(promptManual).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага ручных каналов не мешает итоговому логу', async () => {
    const promptManual = jest.fn().mockRejectedValue(new Error('бот молчит'));
    const { service } = buildService({ promptManual });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('упавший шаг зовёт notifySchedulerFailed с именем шага и текстом ошибки', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const { service, notifySchedulerFailed } = buildService({ runDeliveries });

    await service.tick();

    expect(notifySchedulerFailed).toHaveBeenCalledWith(
      'доставки',
      'канал упал',
      expect.any(DateTime),
    );
  });

  it('упавшее уведомление о сбое шага не роняет тик', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const failingNotify: TeacherNotifier['notifySchedulerFailed'] = jest
      .fn()
      .mockRejectedValue(new Error('бот молчит'));
    const { service } = buildService({
      runDeliveries,
      notifySchedulerFailed: failingNotify,
    });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('успешный тик не зовёт notifySchedulerFailed', async () => {
    const { service, notifySchedulerFailed } = buildService({});

    await service.tick();

    expect(notifySchedulerFailed).not.toHaveBeenCalled();
  });

  it('onApplicationShutdown ждёт тик в полёте (SIGTERM: тик завершается, не обрывается)', async () => {
    let resolvePlan!: (value: PlanResult) => void;
    const deferred = new Promise<PlanResult>((resolve) => {
      resolvePlan = resolve;
    });
    const plan = jest.fn().mockReturnValue(deferred);
    const { service } = buildService({ plan });

    const tickPromise = service.tick();
    let shutdownDone = false;
    const shutdownPromise = service.onApplicationShutdown().then(() => {
      shutdownDone = true;
    });

    // Тик ещё не завершился — shutdown не должен резолвиться раньше него.
    await Promise.resolve();
    await Promise.resolve();
    expect(shutdownDone).toBe(false);

    resolvePlan({ created: 0, removed: 0 });
    await shutdownPromise;
    expect(shutdownDone).toBe(true);
    await tickPromise;
  });

  it('onApplicationShutdown без тика в полёте резолвится сразу', async () => {
    const { service } = buildService({});
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
