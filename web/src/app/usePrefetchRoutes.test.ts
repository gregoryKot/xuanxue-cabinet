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
const loadPayments = vi.fn(() => Promise.resolve({ default: () => null }));
const loadBoard = vi.fn(() => Promise.resolve({ default: () => null }));

vi.mock('./routeModules', () => ({
  ROUTE_MODULES: {
    login: { path: '/login', load: () => loadLogin(), warm: false },
    exams: { path: '/exams', load: () => loadWarm(), warm: true },
    people: { path: '/people', load: () => loadWarmSecond(), warm: true },
    tasks: { path: '/tasks', load: () => loadTasks(), warm: true },
    studentLessons: { path: '/lessons', load: () => loadStudentLessons(), warm: true },
    payments: { path: '/payments', load: () => loadPayments(), warm: true },
    // Последним: тест «по одному чанку за раз» ждёт, что у штата первым
    // идёт `exams` (порядок ключей объекта = порядок очереди).
    board: { path: '/board', load: () => loadBoard(), warm: true },
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
    noTelegram: false,
    hasEmail: true,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    canUseStudentMode: false,
    ...overrides,
  };
}

const TEACHER = makeMe();
const STUDENT = makeMe({ id: 's1', roles: [] });
const ADMIN = makeMe({ id: 'a1', roles: ['admin'] });
const ACCOUNTANT = makeMe({ id: 'b1', roles: ['accountant'] });

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
    expect(loadBoard).toHaveBeenCalledTimes(1);
    expect(loadLogin).not.toHaveBeenCalled();
    expect(loadTasks).not.toHaveBeenCalled();
    expect(loadStudentLessons).not.toHaveBeenCalled();
  });

  // ADR-0171: учителю оплаты закрыты — чанк, который он не откроет, не греем.
  it('учитель без права на оплаты — чанк «Оплат» не греет', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(TEACHER));
    await runIdleQueue();

    expect(loadPayments).not.toHaveBeenCalled();
  });

  it('админ греет разделы штата и «Оплаты»', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(ADMIN));
    await runIdleQueue();

    expect(loadWarm).toHaveBeenCalledTimes(1);
    expect(loadPayments).toHaveBeenCalledTimes(1);
    expect(loadTasks).not.toHaveBeenCalled();
  });

  // ADR-0174: «Доска» — первый экран и штата, и ученика, один чанк на обе
  // роли; бухгалтеру она не нужна — его корень «Оплаты» (ADR-0171).
  it('«Доска» греется и штату, и ученику, бухгалтеру — нет', async () => {
    stubIdleCallback();

    const teacher = renderHook(() => usePrefetchRoutes(TEACHER));
    await runIdleQueue();
    expect(loadBoard).toHaveBeenCalledTimes(1);
    teacher.unmount();

    loadBoard.mockClear();
    const student = renderHook(() => usePrefetchRoutes(STUDENT));
    await runIdleQueue();
    expect(loadBoard).toHaveBeenCalledTimes(1);
    student.unmount();

    loadBoard.mockClear();
    renderHook(() => usePrefetchRoutes(ACCOUNTANT));
    await runIdleQueue();
    expect(loadBoard).not.toHaveBeenCalled();
  });

  it('бухгалтер греет только «Оплаты» — ни штат, ни экраны ученика', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(ACCOUNTANT));
    await runIdleQueue();

    expect(loadPayments).toHaveBeenCalledTimes(1);
    expect(loadWarm).not.toHaveBeenCalled();
    expect(loadWarmSecond).not.toHaveBeenCalled();
    expect(loadTasks).not.toHaveBeenCalled();
    expect(loadStudentLessons).not.toHaveBeenCalled();
    expect(loadBoard).not.toHaveBeenCalled();
  });

  it('ученику греет «Задания» и «Занятия» — не разделы штата (решение владельца)', async () => {
    stubIdleCallback();

    renderHook(() => usePrefetchRoutes(STUDENT));
    await runIdleQueue();

    expect(loadTasks).toHaveBeenCalledTimes(1);
    expect(loadStudentLessons).toHaveBeenCalledTimes(1);
    expect(loadBoard).toHaveBeenCalledTimes(1);
    expect(loadWarm).not.toHaveBeenCalled();
    expect(loadWarmSecond).not.toHaveBeenCalled();
    expect(loadPayments).not.toHaveBeenCalled();
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
