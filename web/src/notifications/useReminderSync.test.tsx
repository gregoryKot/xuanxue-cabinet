// Хук настроек напоминаний (useReminderSync.ts, контракт reminder-sync): сеть,
// события online/offline и отмена при размонтировании поверх решений из
// reminderSyncState.ts (их разбирает reminderSyncState.test.ts). Здесь
// проверяется, что хук делает ровно то, что сказал автомат: один `PATCH` на
// действие, ни одного повтора, одно чтение после неясного исхода.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReminderChange } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { makeMe } from '../test-support/meFixture';
import {
  EVENING_ID,
  MORNING_ID,
  announceConnection,
  deferred,
  makeSnapshot,
  restoreConnectionBetweenTests,
  sentChanges,
  serveReminderSync,
  serveScripted,
  setBrowserOnline,
  syncCalls,
} from '../test-support/reminderSyncFixtures';
import { useReminderSync } from './useReminderSync';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
restoreConnectionBetweenTests();

const TICK_C1: ReminderChange = { kind: 'class', id: MORNING_ID, selected: true };
const TICK_C2: ReminderChange = { kind: 'class', id: EVENING_ID, selected: true };
const NETWORK_FAILURE = new ApiError('Нет связи с сервером.', 0, 'network');
const SERVER_FAILURE = new ApiError('Сбой', 500, 'internal_error');

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

async function mountReady() {
  const hook = renderHook(() => useReminderSync(), { wrapper });
  await waitFor(() => expect(hook.result.current.snapshot).not.toBeNull());
  return hook;
}

type Hook = Awaited<ReturnType<typeof mountReady>>;

async function save(hook: Hook, change: ReminderChange = TICK_C1) {
  await act(async () => {
    hook.result.current.save(change);
    await Promise.resolve(); // дать эффектам и промисам отработать внутри act
  });
}

function signalOf(call: ReturnType<typeof syncCalls>[number] | undefined): AbortSignal {
  return (call?.[1] as { signal: AbortSignal }).signal;
}

describe('useReminderSync — первое чтение', () => {
  it('один GET при монтировании, снимок и ничего лишнего', async () => {
    serveScripted();
    const { result } = await mountReady();

    expect(syncCalls('GET')).toHaveLength(1);
    expect(syncCalls('PATCH')).toHaveLength(0);
    expect(result.current).toMatchObject({
      snapshot: makeSnapshot(),
      loading: false,
      loadError: null,
      controlsDisabled: false,
      notice: null,
      refusal: null,
    });
  });

  it('штат — вида про занятие нет, за снимком никто не ходит', async () => {
    serveReminderSync({ me: makeMe({ roles: ['teacher'] }) });
    const { result } = renderHook(() => useReminderSync(), { wrapper });

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
    );
    await act(() => Promise.resolve());
    expect(syncCalls('GET')).toHaveLength(0);
    expect(result.current).toMatchObject({ snapshot: null, loading: false });
  });

  it('сбой — текст сервера в loadError, «ещё раз» читает заново и приносит снимок', async () => {
    const replies = serveScripted({
      read: new ApiError('Доступ закрыт.', 403, 'forbidden'),
    });
    const { result } = renderHook(() => useReminderSync(), { wrapper });

    await waitFor(() => expect(result.current.loadError).toBe('Доступ закрыт.'));
    expect(result.current.loading).toBe(false);
    expect(syncCalls('GET')).toHaveLength(1);

    replies.read = makeSnapshot({ revision: '3' });
    act(() => result.current.retryRead());

    await waitFor(() => expect(result.current.snapshot?.revision).toBe('3'));
    expect(result.current.loadError).toBeNull();
    expect(syncCalls('GET')).toHaveLength(2);
  });

  it('пока снимка нет, сохранять нечего', async () => {
    serveScripted({ read: new Promise(() => undefined) });
    const { result } = renderHook(() => useReminderSync(), { wrapper });
    await waitFor(() => expect(syncCalls('GET')).toHaveLength(1));

    expect(result.current.loading).toBe(true);
    act(() => result.current.save(TICK_C1));

    expect(syncCalls('PATCH')).toHaveLength(0);
  });
});

describe('useReminderSync — запись', () => {
  it('тело PATCH — версия и одно изменение; ответ становится снимком без второго GET', async () => {
    const response = makeSnapshot({ revision: '2', classIds: [MORNING_ID] });
    serveScripted({ write: response });
    const hook = await mountReady();

    await save(hook);

    expect(syncCalls('PATCH')).toHaveLength(1);
    expect(syncCalls('PATCH')[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: { version: 1, changes: [TICK_C1] },
      }),
    );
    expect(hook.result.current.snapshot).toEqual(response);
    expect(hook.result.current.controlsDisabled).toBe(false);
    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('пока PATCH в пути, контролы выключены, подтверждённое прежнее, а новое намерение не копится', async () => {
    const pending = deferred();
    serveScripted({ write: pending.promise });
    const hook = await mountReady();

    await save(hook, TICK_C1);
    expect(hook.result.current.controlsDisabled).toBe(true);
    expect(hook.result.current.snapshot).toEqual(makeSnapshot());

    await save(hook, TICK_C2);
    await act(async () => {
      pending.settle(makeSnapshot({ revision: '2', classIds: [MORNING_ID] }));
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
    });

    // Второе действие в очередь не встало: после ответа первого оно не ушло.
    expect(sentChanges()).toEqual([[TICK_C1]]);
    expect(hook.result.current.snapshot?.classIds).toEqual([MORNING_ID]);
    expect(hook.result.current.controlsDisabled).toBe(false);
  });

  it('два вызова save в одном тике — один PATCH', async () => {
    serveScripted({ write: makeSnapshot({ revision: '2' }) });
    const hook = await mountReady();

    await act(async () => {
      hook.result.current.save(TICK_C1);
      hook.result.current.save(TICK_C2);
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
    });

    expect(sentChanges()).toEqual([[TICK_C1]]);
  });

  it('несколько действий подряд — каждое своим PATCH, по одному за раз', async () => {
    serveScripted({ write: makeSnapshot({ revision: '2' }) });
    const hook = await mountReady();

    await save(hook, TICK_C1);
    await save(hook, TICK_C2);
    await save(hook, { kind: 'lead', minutes: 0 });

    expect(sentChanges()).toEqual([[TICK_C1], [TICK_C2], [{ kind: 'lead', minutes: 0 }]]);
  });
});

describe('useReminderSync — сеть', () => {
  it('нет сети — контролы выключены и сказано почему, запись не уходит; сеть вернулась — включены', async () => {
    serveScripted();
    const hook = await mountReady();

    announceConnection(false);
    expect(hook.result.current).toMatchObject({
      controlsDisabled: true,
      notice: 'offline',
    });
    act(() => hook.result.current.save(TICK_C1));
    expect(syncCalls('PATCH')).toHaveLength(0);

    announceConnection(true);
    expect(hook.result.current).toMatchObject({ controlsDisabled: false, notice: null });
    // Ничего не копилось и не отправилось на возвращении сети.
    expect(syncCalls('PATCH')).toHaveLength(0);
    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('открыт без сети — контролы выключены с первого кадра', async () => {
    setBrowserOnline(false);
    serveScripted();
    const hook = await mountReady();

    expect(hook.result.current).toMatchObject({
      controlsDisabled: true,
      notice: 'offline',
    });
  });
});

describe('useReminderSync — неясный исход записи', () => {
  it.each([
    ['сбой сети', NETWORK_FAILURE],
    ['ошибка сервера 500', SERVER_FAILURE],
    ['недоступен 503', new ApiError('Сервис недоступен', 503, 'unknown')],
    ['429', new ApiError('Слишком часто', 429, 'rate_limited')],
    ['ответ 2xx не снимок', { version: 1 }],
    ['ответ 2xx не разобрался как JSON', new SyntaxError('Unexpected token')],
    ['снимок другого аккаунта', makeSnapshot({ accountId: 'u2', revision: '9' })],
    ['снимок со старой ревизией', makeSnapshot({ revision: '0' })],
  ])(
    '%s: один GET вместо повтора, PATCH не повторён, после чтения контролы включены',
    async (_name, failure) => {
      const replies = serveScripted();
      const hook = await mountReady();
      // Подтверждено: ревизия 1. Пока запись летела, сервер ушёл на ревизию 3.
      const current = makeSnapshot({ revision: '3', classIds: [MORNING_ID, EVENING_ID] });
      replies.read = current;
      replies.write = failure;

      await save(hook);

      await waitFor(() => expect(hook.result.current.snapshot).toEqual(current));
      expect(syncCalls('PATCH')).toHaveLength(1);
      expect(syncCalls('GET')).toHaveLength(2);
      expect(hook.result.current).toMatchObject({
        controlsDisabled: false,
        notice: null,
        refusal: null,
      });
      // Дальше тишина: ни повтора записи, ни второго чтения.
      await act(() => Promise.resolve());
      expect(syncCalls('PATCH')).toHaveLength(1);
      expect(syncCalls('GET')).toHaveLength(2);
    },
  );

  it('пока чтение идёт — «проверяем», подтверждённое прежнее, сохранение закрыто', async () => {
    const reading = deferred();
    const replies = serveScripted();
    const hook = await mountReady();
    replies.write = NETWORK_FAILURE;
    replies.read = reading.promise;

    await save(hook);

    await waitFor(() => expect(hook.result.current.notice).toBe('checking'));
    expect(hook.result.current.controlsDisabled).toBe(true);
    expect(hook.result.current.snapshot).toEqual(makeSnapshot());
    act(() => hook.result.current.save(TICK_C2));
    expect(syncCalls('PATCH')).toHaveLength(1);

    await act(async () => {
      reading.settle(makeSnapshot({ revision: '2' }));
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
    });
    expect(hook.result.current.notice).toBeNull();
    expect(hook.result.current.snapshot?.revision).toBe('2');
  });

  it('связи нет, когда запись оборвалась: чтение ждёт события online и уходит один раз', async () => {
    const writing = deferred();
    const replies = serveScripted({ write: writing.promise });
    const hook = await mountReady();

    await save(hook);
    announceConnection(false);
    replies.read = makeSnapshot({ revision: '2' });
    await act(async () => {
      writing.fail(NETWORK_FAILURE);
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
    });

    expect(hook.result.current.notice).toBe('waitingForNetwork');
    expect(syncCalls('GET')).toHaveLength(1);

    announceConnection(true);

    await waitFor(() => expect(hook.result.current.snapshot?.revision).toBe('2'));
    expect(syncCalls('GET')).toHaveLength(2);
    expect(syncCalls('PATCH')).toHaveLength(1);
  });

  it('проверка не удалась — «проверить ещё раз», сохранение закрыто, чтения по таймеру нет; повтор приносит покой', async () => {
    const replies = serveScripted();
    const hook = await mountReady();
    replies.write = SERVER_FAILURE;
    replies.read = new ApiError('Сервис недоступен', 503, 'unknown');

    await save(hook);

    await waitFor(() => expect(hook.result.current.notice).toBe('checkFailed'));
    expect(hook.result.current.controlsDisabled).toBe(true);
    act(() => hook.result.current.save(TICK_C2));
    await act(() => Promise.resolve());
    expect(syncCalls('PATCH')).toHaveLength(1);
    expect(syncCalls('GET')).toHaveLength(2);

    replies.read = makeSnapshot({ revision: '4' });
    act(() => hook.result.current.retryRead());

    await waitFor(() => expect(hook.result.current.notice).toBeNull());
    expect(hook.result.current.snapshot?.revision).toBe('4');
    expect(hook.result.current.controlsDisabled).toBe(false);
    expect(syncCalls('GET')).toHaveLength(3);
    expect(syncCalls('PATCH')).toHaveLength(1);
  });
});

describe('useReminderSync — определённый отказ', () => {
  it.each([
    [400, 'invalid_input', 'Такого занятия нет в расписании.'],
    [409, 'selection_limit', 'Можно отметить не больше 50 занятий.'],
    [403, 'forbidden', 'Доступ закрыт.'],
    [413, 'payload_too_large', 'Слишком много изменений.'],
    [415, 'unsupported_media_type', 'Нужен JSON.'],
  ] as const)(
    '%i: текст сервера у контрола, чтения нет, следующее сохранение уходит',
    async (status, code, message) => {
      const replies = serveScripted({ write: new ApiError(message, status, code) });
      const hook = await mountReady();

      await save(hook, TICK_C1);

      expect(hook.result.current.refusal).toEqual({ kind: 'class', message });
      expect(hook.result.current.controlsDisabled).toBe(false);
      expect(hook.result.current.snapshot).toEqual(makeSnapshot());
      expect(syncCalls('GET')).toHaveLength(1);

      replies.write = makeSnapshot({ revision: '2' });
      await save(hook, TICK_C2);

      expect(sentChanges()).toEqual([[TICK_C1], [TICK_C2]]);
      expect(hook.result.current.refusal).toBeNull();
    },
  );

  it('отказ помнит, чьё это изменение: у поля «за сколько» — lead', async () => {
    serveScripted({
      write: new ApiError('Выберите время из списка.', 400, 'invalid_input'),
    });
    const hook = await mountReady();

    await save(hook, { kind: 'lead', minutes: 15 });

    expect(hook.result.current.refusal?.kind).toBe('lead');
  });

  it('401 — состояние прежнее, текста нет, чтения нет', async () => {
    serveScripted({ write: new ApiError('Войдите', 401, 'unauthorized') });
    const hook = await mountReady();

    await save(hook);

    expect(hook.result.current).toMatchObject({
      refusal: null,
      controlsDisabled: false,
      snapshot: makeSnapshot(),
    });
    expect(syncCalls('GET')).toHaveLength(1);
  });
});

describe('useReminderSync — размонтирование и сигналы', () => {
  it('запись оборвана сигналом, ответ после ухода никуда не попадает', async () => {
    const pending = deferred();
    serveScripted({ write: pending.promise });
    const hook = await mountReady();
    await save(hook);
    const signal = signalOf(syncCalls('PATCH')[0]);
    expect(signal.aborted).toBe(false);

    hook.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.settle(makeSnapshot({ revision: '2', classIds: [MORNING_ID] }));
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
    });

    expect(syncCalls('GET')).toHaveLength(1);
    expect(syncCalls('PATCH')).toHaveLength(1);
  });

  it('первое чтение оборвано сигналом', async () => {
    serveScripted({ read: new Promise(() => undefined) });
    const hook = renderHook(() => useReminderSync(), { wrapper });
    await waitFor(() => expect(syncCalls('GET')).toHaveLength(1));
    const signal = signalOf(syncCalls('GET')[0]);

    hook.unmount();

    expect(signal.aborted).toBe(true);
  });

  it('уход сети во время проверки обрывает чтение; запоздавший ответ ничего не меняет, возврат читает заново', async () => {
    const reading = deferred();
    const replies = serveScripted();
    const hook = await mountReady();
    replies.write = SERVER_FAILURE;
    replies.read = reading.promise;

    await save(hook);
    await waitFor(() => expect(syncCalls('GET')).toHaveLength(2));
    const interrupted = signalOf(syncCalls('GET')[1]);
    announceConnection(false);
    expect(interrupted.aborted).toBe(true);

    await act(async () => {
      reading.settle(makeSnapshot({ revision: '9' }));
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
    });
    expect(hook.result.current.snapshot?.revision).toBe('1');
    expect(hook.result.current.notice).toBe('waitingForNetwork');

    announceConnection(true);
    await waitFor(() => expect(syncCalls('GET')).toHaveLength(3));
  });
});

describe('useReminderSync — Retry-After', () => {
  const HOLD_SEC = 60;
  const HOLD_MS = HOLD_SEC * 1000;
  const throttled = () =>
    new ApiError('Слишком часто', 429, 'rate_limited', undefined, undefined, HOLD_SEC);

  // Часы подменяются только у таймеров хука, и после монтирования: `waitFor` из
  // testing-library сам живёт на таймерах и с подменёнными не дождался бы.
  const useHookTimers = () =>
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  afterEach(() => vi.useRealTimers());

  async function advance(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
      await Promise.resolve(); // дать эффектам и промисам отработать внутри act
      await Promise.resolve();
    });
  }

  it('429 с Retry-After: чтение не уходит до конца паузы, потом уходит одно; запись не повторяется', async () => {
    const replies = serveScripted();
    const hook = await mountReady();
    useHookTimers();
    const current = makeSnapshot({ revision: '3', classIds: [MORNING_ID] });
    replies.read = current;
    replies.write = throttled();

    await save(hook);

    expect(hook.result.current).toMatchObject({
      notice: 'retryHold',
      controlsDisabled: true,
    });
    await advance(HOLD_MS - 1);
    expect(syncCalls('GET')).toHaveLength(1);
    act(() => hook.result.current.save(TICK_C2));
    expect(syncCalls('PATCH')).toHaveLength(1);

    await advance(1);

    expect(syncCalls('GET')).toHaveLength(2);
    expect(hook.result.current.snapshot).toEqual(current);
    expect(hook.result.current).toMatchObject({ notice: null, controlsDisabled: false });
    await advance(HOLD_MS * 2);
    expect(syncCalls('PATCH')).toHaveLength(1);
    expect(syncCalls('GET')).toHaveLength(2);
  });

  it('503 с Retry-After держит чтение так же, как 429', async () => {
    const replies = serveScripted();
    const hook = await mountReady();
    useHookTimers();
    replies.write = new ApiError('Недоступно', 503, 'unknown', undefined, undefined, 5);

    await save(hook);
    await advance(4999);
    expect(syncCalls('GET')).toHaveLength(1);
    await advance(1);

    expect(syncCalls('GET')).toHaveLength(2);
    expect(syncCalls('PATCH')).toHaveLength(1);
  });

  it('сбой проверки с Retry-After: «ещё раз» до конца паузы ничего не шлёт, после — читает', async () => {
    const replies = serveScripted();
    const hook = await mountReady();
    useHookTimers();
    replies.write = SERVER_FAILURE;
    replies.read = throttled();
    await save(hook);
    await advance(0);
    expect(hook.result.current.notice).toBe('checkFailed');
    expect(syncCalls('GET')).toHaveLength(2);

    act(() => hook.result.current.retryRead());
    await advance(HOLD_MS - 1);
    expect(syncCalls('GET')).toHaveLength(2);

    await advance(1);
    replies.read = makeSnapshot({ revision: '4' });
    act(() => hook.result.current.retryRead());
    await advance(0);

    expect(syncCalls('GET')).toHaveLength(3);
    expect(hook.result.current.snapshot?.revision).toBe('4');
    expect(syncCalls('PATCH')).toHaveLength(1);
  });
  it('уход с экрана гасит таймер паузы: чтения после ухода нет', async () => {
    const replies = serveScripted();
    const hook = await mountReady();
    useHookTimers();
    replies.write = throttled();
    await save(hook);
    expect(vi.getTimerCount()).toBe(1);

    hook.unmount();
    await advance(HOLD_MS * 2);

    expect(vi.getTimerCount()).toBe(0);
    expect(syncCalls('GET')).toHaveLength(1);
    expect(syncCalls('PATCH')).toHaveLength(1);
  });
});
