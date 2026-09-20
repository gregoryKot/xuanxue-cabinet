import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { usePrefetchRoutes } from './usePrefetchRoutes';

// Настоящие ROUTE_MODULES тянут в тест все экраны кабинета — проверяем
// механику очереди и разделение по роли на фейках, а «какие экраны
// действительно греются» проверяет routeModules.test.ts на настоящей таблице.
const loadWarm = vi.fn(() => Promise.resolve({ default: () => null }));
const loadWarmSecond = vi.fn(() => Promise.resolve({ default: () => null }));
const loadLogin = vi.fn(() => Promise.resolve({ default: () => null }));
const loadTasks = vi.fn(() => Promise.resolve({ default: () => null }));
const loadStudentLessons = vi.fn(() => Promise.resolve({ default: () => null }));

vi.mock('./routeModules', () => ({
  ROUTE_MODULES: {
    login: { path: '/login', load: () => loadLogin(), warm: false },
    exams: { path: '/exams', load: () => loadWarm(), warm: true },
    people: { path: '/people', load: () => loadWarmSecond(), warm: true },
    tasks: { path: '/tasks', load: () => loadTasks(), warm: true },
    studentLessons: { path: '/lessons', load: () => loadStudentLessons(), warm: true },
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

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    hasEmail: true,
    needsProfile: false,
    ...overrides,
  };
}

const TEACHER = makeMe();
const STUDENT = makeMe({ id: 's1', roles: [] });

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
  it('штату греет разделы штата ровно по разу — не вход, не экраны ученика', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(TEACHER));
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).toHaveBeenCalledTimes(1);
    expect(loadLogin).not.toHaveBeenCalled();
    expect(loadTasks).not.toHaveBeenCalled();
    expect(loadStudentLessons).not.toHaveBeenCalled();
  });

  it('ученику греет «Задания» и «Занятия» — не разделы штата (решение владельца)', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(STUDENT));
    await runIdleQueue();

    expect(loadTasks).toHaveBeenCalledTimes(1);
    expect(loadStudentLessons).toHaveBeenCalledTimes(1);
    expect(loadWarm).not.toHaveBeenCalled();
    expect(loadWarmSecond).not.toHaveBeenCalled();
  });

  it('по одному чанку за раз, чтобы не мешать первому экрану', () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(TEACHER));
    idleTasks.shift()?.();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).not.toHaveBeenCalled();
  });

  it('не догрузившийся чанк не обрывает очередь', async () => {
    stubIdleCallback();
    loadWarm.mockRejectedValueOnce(new Error('офлайн'));

    renderHook(() => usePrefetchRoutes(TEACHER));
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).toHaveBeenCalledTimes(1);
  });

  it('сессия ещё не известна (null) — не грузит ничего', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(null));
    await runIdleQueue();

    expect(loadWarm).not.toHaveBeenCalled();
    expect(idleTasks).toHaveLength(0);
  });

  it('размонтирование останавливает очередь', async () => {
    stubIdleCallback();

    const { unmount } = renderHook(() => usePrefetchRoutes(TEACHER));
    unmount();
    await runIdleQueue();

    expect(cancelIdle).toHaveBeenCalled();
    expect(loadWarm).not.toHaveBeenCalled();
  });

  it('ушли с экрана посреди загрузки — следующий чанк не планируется', async () => {
    stubIdleCallback();

    const { unmount } = renderHook(() => usePrefetchRoutes(TEACHER));
    idleTasks.shift()?.(); // первый чанк уже летит
    unmount();
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).not.toHaveBeenCalled();
  });

  it('без requestIdleCallback (Safari) работает на setTimeout', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();

    renderHook(() => usePrefetchRoutes(TEACHER));
    await vi.advanceTimersByTimeAsync(1000);

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadWarmSecond).toHaveBeenCalledTimes(1);
  });
});
