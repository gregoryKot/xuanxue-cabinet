// Юнит-тест на фейках трёх шагов (CLAUDE.md «Тесты»: детерминизм — без
// setTimeout-ожиданий, свой resolve() вместо реальных часов).
import { DateTime } from 'luxon';
import type { BroadcastPlannerService } from '../broadcasts/broadcast-planner.service';
import type { DeliveryRunnerService } from '../deliveries/delivery-runner.service';
import type { LessonPlannerService, PlanResult } from '../lessons/lesson-planner.service';
import { SchedulerService } from './scheduler.service';

function buildService(overrides: {
  plan?: LessonPlannerService['plan'];
  planBroadcasts?: BroadcastPlannerService['plan'];
  runDeliveries?: DeliveryRunnerService['run'];
}): SchedulerService {
  const plan = overrides.plan ?? jest.fn().mockResolvedValue({ created: 0, removed: 0 });
  const planBroadcasts =
    overrides.planBroadcasts ?? jest.fn().mockResolvedValue({ broadcasts: 0 });
  const runDeliveries =
    overrides.runDeliveries ?? jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
  return new SchedulerService(
    { plan } as unknown as LessonPlannerService,
    { plan: planBroadcasts } as unknown as BroadcastPlannerService,
    { run: runDeliveries } as unknown as DeliveryRunnerService,
  );
}

describe('SchedulerService.tick', () => {
  it('зовёт все три шага с одним DateTime, не бросает', async () => {
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
    const service = buildService({ plan, planBroadcasts, runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();

    expect(plan).toHaveBeenCalledTimes(1);
    expect(planBroadcasts).toHaveBeenCalledTimes(1);
    expect(runDeliveries).toHaveBeenCalledTimes(1);
    const [calledWith] = plan.mock.calls[0] ?? [];
    expect(calledWith).toBeInstanceOf(DateTime);
    // Все три шага делят один now — рассылка не может считать «позже», чем
    // видел планировщик занятий в этом же тике.
    expect(planBroadcasts.mock.calls[0]?.[0]).toBe(calledWith);
    expect(runDeliveries.mock.calls[0]?.[0]).toBe(calledWith);
  });

  it('ошибка шага рассылок не останавливает шаг доставок', async () => {
    const planBroadcasts = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const service = buildService({ planBroadcasts, runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(runDeliveries).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага занятий не останавливает шаги рассылок и доставок', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const planBroadcasts = jest.fn().mockResolvedValue({ broadcasts: 0 });
    const runDeliveries = jest.fn().mockResolvedValue({ sent: 0, failed: 0 });
    const service = buildService({ plan, planBroadcasts, runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
    expect(planBroadcasts).toHaveBeenCalledTimes(1);
    expect(runDeliveries).toHaveBeenCalledTimes(1);
  });

  it('ошибка шага доставок не мешает итоговому логу', async () => {
    const runDeliveries = jest.fn().mockRejectedValue(new Error('канал упал'));
    const service = buildService({ runDeliveries });

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('onApplicationShutdown ждёт тик в полёте (SIGTERM: тик завершается, не обрывается)', async () => {
    let resolvePlan!: (value: PlanResult) => void;
    const deferred = new Promise<PlanResult>((resolve) => {
      resolvePlan = resolve;
    });
    const plan = jest.fn().mockReturnValue(deferred);
    const service = buildService({ plan });

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
    const service = buildService({});
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
