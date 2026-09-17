import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefetchRoutes } from './usePrefetchRoutes';

// Настоящие ROUTE_MODULES тянут в тест все пятнадцать экранов кабинета —
// проверяем механику очереди на фейках, а «какие экраны греются» проверяет
// routeModules.test.ts на настоящей таблице.
const loadWarm = vi.fn(() => Promise.resolve({ default: () => null }));
const loadWarmSecond = vi.fn(() => Promise.resolve({ default: () => null }));
const loadLogin = vi.fn(() => Promise.resolve({ default: () => null }));

vi.mock('./routeModules', () => ({
  ROUTE_MODULES: {
    login: { path: '/login', load: () => loadLogin(), warm: false },
    exams: { path: '/exams', load: () => loadWarm(), warm: true },
    people: { path: '/people', load: () => loadWarmSecond(), warm: true },
  },
}));

let idleTasks: (() => void)[] = [];
const cancelIdle = vi.fn();

function stubIdleCallback(): void {
  vi.stubGlobal('requestIdleCallback', (task: () => void) => {
    idleTasks.push(task);
    return idleTasks.length;
  });
  vi.stubGlobal('cancelIdleCallback', cancelIdle);
}

/** Прогоняет очередь простоя: каждая задача успевает дождаться своего load(). */
async function runIdleQueue(): Promise<void> {
  for (let step = 0; step < 10 && idleTasks.length > 0; step += 1) {
    idleTasks.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  idleTasks = [];
  vi.clearAllMocks();
});

afterEach(() => {
  // Размонтируем, пока стабы ещё на месте: общий cleanup из setupTests.ts
  // сработал бы уже после unstubAllGlobals, и отмена запланированной задачи
  // упала бы на пропавшем cancelIdleCallback.
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('usePrefetchRoutes', () => {
  it('грузит каждый экран кабинета ровно раз и не трогает экраны входа', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(true));
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).toHaveBeenCalledTimes(1);
    expect(loadLogin).not.toHaveBeenCalled();
  });

  it('по одному чанку за раз, чтобы не мешать первому экрану', () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(true));
    idleTasks.shift()?.();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).not.toHaveBeenCalled();
  });

  it('не догрузившийся чанк не обрывает очередь', async () => {
    stubIdleCallback();
    loadWarm.mockRejectedValueOnce(new Error('офлайн'));

    renderHook(() => usePrefetchRoutes(true));
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).toHaveBeenCalledTimes(1);
  });

  it('выключенным (сессии ещё нет, роль не та) не грузит ничего', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(false));
    await runIdleQueue();

    expect(loadWarm).not.toHaveBeenCalled();
    expect(idleTasks).toHaveLength(0);
  });

  it('размонтирование останавливает очередь', async () => {
    stubIdleCallback();

    const { unmount } = renderHook(() => usePrefetchRoutes(true));
    unmount();
    await runIdleQueue();

    expect(cancelIdle).toHaveBeenCalled();
    expect(loadWarm).not.toHaveBeenCalled();
  });

  it('ушли с экрана посреди загрузки — следующий чанк не планируется', async () => {
    stubIdleCallback();

    const { unmount } = renderHook(() => usePrefetchRoutes(true));
    idleTasks.shift()?.(); // первый чанк уже летит
    unmount();
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).not.toHaveBeenCalled();
  });

  it('без requestIdleCallback (Safari) работает на setTimeout', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();

    renderHook(() => usePrefetchRoutes(true));
    await vi.advanceTimersByTimeAsync(1000);

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).toHaveBeenCalledTimes(1);
  });
});
