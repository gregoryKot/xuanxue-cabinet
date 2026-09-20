import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxPageDto, MyExamDto, NotificationDto } from '@xuanxue/shared';
import {
  MY_EXAMS_PATH,
  NOTIFICATIONS_FEED_PATH,
  NOTIFICATIONS_READ_ALL_PATH,
  notificationReadPath,
} from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import {
  NOTIFICATIONS_POLL_INTERVAL_MS,
  useNotificationsData,
} from './useNotificationsData';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const NEW_EXAM: MyExamDto = {
  id: 'e1',
  title: 'Форма 1',
  description: '',
  level: '1',
  attemptsAllowed: 3,
  attemptsUsed: 0,
};
// Уже сдан на проверку — не «новое», getExamAction возвращает не 'start'.
const STARTED_EXAM: MyExamDto = {
  id: 'e2',
  title: 'Форма 2',
  description: '',
  level: '1',
  attemptsAllowed: 3,
  attemptsUsed: 1,
  lastAttempt: { id: 'a1', status: 'submitted' },
};

const UNREAD: NotificationDto = {
  id: 'n1',
  kind: 'post_draft',
  text: 'Текст 1',
  createdAt: '2026-09-20T04:00:00.000Z',
};
const READ: NotificationDto = {
  id: 'n2',
  kind: 'post_draft',
  text: 'Текст 2',
  createdAt: '2026-09-20T03:00:00.000Z',
  readAt: '2026-09-20T03:05:00.000Z',
};

/** Страница ленты: `unreadCount` считает сервер по всей ленте, не по этим
 * строкам (shared/src/inbox.ts) — фикстура задаёт его отдельно нарочно. */
function page(items: NotificationDto[], unreadCount = items.length): InboxPageDto {
  return { items, unreadCount };
}

/** Сколько раз апи звали ровно по адресу ленты (без мутаций под тем же
 * префиксом) — считает случившиеся GET/reload. */
function feedCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === NOTIFICATIONS_FEED_PATH)
    .length;
}

/** То же самое для /me/exams — второй источник счётчика, опрос обновляет
 * оба одним тиком (ADR-0070). */
function examsCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === MY_EXAMS_PATH).length;
}

describe('useNotificationsData — счётчик', () => {
  it('складывает непрочитанные строки и новые задания', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM, STARTED_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD, READ], 1),
    });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // count = 1 непрочитанная строка (число с сервера) + 1 новое задание.
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(result.current.newTasks).toEqual([NEW_EXAM]);
  });

  it('непрочитанных больше страницы — берём число сервера, не длину списка', async () => {
    // Лимит страницы 50, непрочитанных 60: счёт по загруженным строкам
    // показал бы 50 и занизил бы пилюлю у значка (shared/src/inbox.ts).
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 60),
    });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(result.current.unreadCount).toBe(60));
    expect(result.current.count).toBe(60);
  });

  it('прочитанные строки в счётчик не идут', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [], [NOTIFICATIONS_FEED_PATH]: page([READ], 0) });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(result.current.count).toBe(0));
  });
});

describe('useNotificationsData — markRead/markAllRead (read-after-write)', () => {
  it('markRead шлёт POST по адресу строки и перечитывает ленту', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      '/me/inbox/': undefined,
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = feedCallCount();

    await result.current.markRead(UNREAD.id);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      notificationReadPath(UNREAD.id),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(feedCallCount()).toBe(callsBefore + 1);
  });

  it('markAllRead шлёт POST на read-all и перечитывает ленту', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      '/me/inbox/': undefined,
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = feedCallCount();

    await result.current.markAllRead();

    expect(mockedApiFetch).toHaveBeenCalledWith(
      NOTIFICATIONS_READ_ALL_PATH,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(feedCallCount()).toBe(callsBefore + 1);
  });
});

describe('useNotificationsData — ошибки', () => {
  it('ошибка ленты отдаёт error и items === null', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
    });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Сервис недоступен');
    expect(result.current.items).toBeNull();
  });

  it('сбой запроса экзаменов не ломает ленту', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderHook(() => useNotificationsData());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([UNREAD]);
    expect(result.current.error).toBeNull();
    expect(result.current.newTasks).toEqual([]);
  });
});

describe('useNotificationsData — опрос (ADR-0070)', () => {
  // Фейковые таймеры — иначе тест ждал бы настоящую минуту (CLAUDE.md
  // «Детерминизм»). advanceTimersByTimeAsync, не Async-less вариант: между
  // тиками таймера нужно дать промисам apiFetch долиться до состояния.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Видимость трогает только тест «вкладка скрыта» ниже, но сбрасываем
    // безусловно — иначе скрытое состояние протекло бы в соседний тест.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('через минуту перечитывает /me/inbox и /me/exams — count меняется на новое число', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [], [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1) });
    const { result } = renderHook(() => useNotificationsData());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.count).toBe(1);
    const feedBefore = feedCallCount();
    const examsBefore = examsCallCount();

    // Между тиками у ленты и у экзаменов появилось по новой строке — тот же
    // тик опроса обязан подхватить оба источника.
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 4),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS);
    });

    expect(feedCallCount()).toBe(feedBefore + 1);
    expect(examsCallCount()).toBe(examsBefore + 1);
    expect(result.current.count).toBe(5); // 4 непрочитанных + 1 новое задание
  });

  it('пока вкладка скрыта — новых запросов нет', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [], [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1) });
    const { result } = renderHook(() => useNotificationsData());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const feedBefore = feedCallCount();
    const examsBefore = examsCallCount();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS * 3);
    });

    expect(feedCallCount()).toBe(feedBefore);
    expect(examsCallCount()).toBe(examsBefore);
    expect(result.current.loading).toBe(false);
  });
});
