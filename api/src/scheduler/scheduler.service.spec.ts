// Юнит-тест на фейке LessonPlannerService (CLAUDE.md «Тесты»: детерминизм —
// без setTimeout-ожиданий, свой resolve() вместо реальных часов).
import { DateTime } from 'luxon';
import type { LessonPlannerService, PlanResult } from '../lessons/lesson-planner.service';
import { SchedulerService } from './scheduler.service';

function buildService(plan: LessonPlannerService['plan']): SchedulerService {
  return new SchedulerService({ plan } as unknown as LessonPlannerService);
}

describe('SchedulerService.tick', () => {
  it('зовёт plan() с DateTime и логирует успех, не бросает', async () => {
    const plan = jest.fn((_now: DateTime): Promise<PlanResult> =>
      Promise.resolve({ created: 2, removed: 1 }),
    );
    const service = buildService(plan);

    await expect(service.tick()).resolves.toBeUndefined();

    expect(plan).toHaveBeenCalledTimes(1);
    const [calledWith] = plan.mock.calls[0] ?? [];
    expect(calledWith).toBeInstanceOf(DateTime);
  });

  it('ошибка plan() ловится внутри тика, наружу не уходит', async () => {
    const plan = jest.fn().mockRejectedValue(new Error('mongo упал'));
    const service = buildService(plan);

    await expect(service.tick()).resolves.toBeUndefined();
  });

  it('onApplicationShutdown ждёт тик в полёте (SIGTERM: тик завершается, не обрывается)', async () => {
    let resolvePlan!: (value: PlanResult) => void;
    const deferred = new Promise<PlanResult>((resolve) => {
      resolvePlan = resolve;
    });
    const plan = jest.fn().mockReturnValue(deferred);
    const service = buildService(plan);

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
    const service = buildService(jest.fn().mockResolvedValue({ created: 0, removed: 0 }));
    await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
  });
});
