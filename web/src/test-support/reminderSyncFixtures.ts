// Общая обвязка тестов настроек напоминаний (контракт reminder-sync, ADR-0185):
// снимок, сервер с разными ответами на `GET` и `PATCH` одного пути и
// переключатель сети. `mockApiByPath` отвечает по пути, а здесь путь у чтения и
// записи один — различает метод; очереди `…Once` нет (check-once-mock-ratchet).
import { act } from '@testing-library/react';
import { afterEach, vi, type MockInstance } from 'vitest';
import type {
  LessonScopeClassDto,
  MeDto,
  ReminderChange,
  ReminderSyncSnapshot,
} from '@xuanxue/shared';
import { mockedApiFetch } from './apiFetchMock';
import { makeMe } from './meFixture';

export const SYNC_PATH = '/me/notifications/lessons/sync';

export function makeClass(
  id: string,
  title: string,
  weekday: number,
  time: string,
  groupLabel = '',
): LessonScopeClassDto {
  return {
    id,
    title,
    groupLabel,
    tz: 'Asia/Jerusalem',
    slots: [{ weekday, time, durationMin: 60 }],
  };
}

export const MORNING = makeClass('c1', 'Тайцзи для начинающих', 1, '10:00', 'утро');
export const EVENING = makeClass('c2', 'Цигун', 3, '19:00');

export function makeSnapshot(
  overrides: Partial<ReminderSyncSnapshot> = {},
): ReminderSyncSnapshot {
  return {
    version: 1,
    accountId: 'u1',
    revision: '1',
    classIds: [],
    lessonIds: [],
    leadMinutes: null,
    schoolMinutes: 60,
    classes: [MORNING, EVENING],
    ...overrides,
  };
}

/** Ответ сервера: значение, ошибка (отказ) или функция — для ответа, который
 * задерживается или считается в момент запроса. */
export type Reply = unknown;

function resolveReply(reply: Reply): Promise<unknown> {
  const value = typeof reply === 'function' ? (reply as () => unknown)() : reply;
  return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
}

interface ServerScript {
  me: MeDto;
  /** Ответ на `GET` снимка. */
  read?: Reply;
  /** Ответ на `PATCH` снимка. */
  write?: Reply;
  /** Остальные пути по префиксу (виды уведомлений и т. п.). */
  others?: Record<string, Reply>;
}

export function serveReminderSync({ me, read, write, others = {} }: ServerScript): void {
  mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === SYNC_PATH) return resolveReply(init?.method === 'PATCH' ? write : read);
    const prefix = Object.keys(others).find((key) => path.startsWith(key));
    if (prefix !== undefined) return resolveReply(others[prefix]);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

/** Сервер, ответы которого тест меняет по ходу: что вернёт следующее чтение и
 * следующая запись. Читает снимок ученика `u1` (`makeMe`), если не сказано иное. */
export function serveScripted(
  initial: {
    me?: MeDto;
    read?: Reply;
    write?: Reply;
    others?: Record<string, Reply>;
  } = {},
) {
  const replies = { read: initial.read ?? makeSnapshot(), write: initial.write };
  serveReminderSync({
    me: initial.me ?? makeMe(),
    read: () => replies.read,
    write: () => replies.write,
    others: initial.others,
  });
  return replies;
}

/** Ответ, который приходит, когда тест решит: `settle` — успехом, `fail` —
 * отказом промиса. */
export function deferred() {
  let settle: (value: unknown) => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

/** Вызовы снимка: `GET` или `PATCH`. */
export function syncCalls(method: 'GET' | 'PATCH') {
  return mockedApiFetch.mock.calls.filter(
    ([path, init]) =>
      path === SYNC_PATH &&
      ((init as { method?: string } | undefined)?.method ?? 'GET') === method,
  );
}

/** Изменения из тел всех `PATCH`: по ним видно, что ушло и сколько раз. */
export function sentChanges(): ReminderChange[][] {
  return syncCalls('PATCH').map(
    ([, init]) => (init as { body: { changes: ReminderChange[] } }).body.changes,
  );
}

let onLineSpy: MockInstance<() => boolean> | null = null;

/** Что скажет `navigator.onLine`, без события — для первого рендера. */
export function setBrowserOnline(online: boolean): void {
  onLineSpy ??= vi.spyOn(window.navigator, 'onLine', 'get');
  onLineSpy.mockReturnValue(online);
}

/** Связь сменилась: значение `navigator.onLine` и событие окна. */
export function announceConnection(online: boolean): void {
  setBrowserOnline(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

/** Зовётся на уровне файла теста: возвращает настоящий `navigator.onLine`. */
export function restoreConnectionBetweenTests(): void {
  afterEach(() => {
    onLineSpy?.mockRestore();
    onLineSpy = null;
  });
}
