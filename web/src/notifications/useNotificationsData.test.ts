import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  InboxPageDto,
  MeDto,
  MyExamDto,
  NotificationDto,
  UserRole,
} from '@xuanxue/shared';
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

const STUDENT_ME: MeDto = {
  id: 'u1',
  name: 'Аня',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

/** teacher/assistant/admin — тот же список, что TEACHER_ROLES в
 * screenAccess.ts; для счётчика уведомлений важна только роль, остальной
 * профиль как у STUDENT_ME. */
function staffMe(role: UserRole): MeDto {
  return { ...STUDENT_ME, roles: [role] };
}

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

/** Сколько раз апи звали по адресу экзаменов — ноль здесь стережёт именно
 * `enabled: !isTeacher(me)` у useMyExams, а не фильтр newTasks после ответа
 * (ADR-0074): фильтр дал бы тот же пустой newTasks и на включённом запросе
 * с пустым ответом сервера, а настоящая гарантия — что запрос вообще не
 * ушёл. */
/** Ноль здесь же стережёт, что тик опроса не будит выключенный запрос
 * (ADR-0076): тихий refresh() на выключенном хуке молчит. */
function examsCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === MY_EXAMS_PATH).length;
}

describe('useNotificationsData — счётчик', () => {
  it('складывает непрочитанные строки и новые задания', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM, STARTED_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD, READ], 1),
    });
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
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
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(result.current.unreadCount).toBe(60));
    expect(result.current.count).toBe(60);
  });

  it('прочитанные строки в счётчик не идут', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [], [NOTIFICATIONS_FEED_PATH]: page([READ], 0) });
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
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
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
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
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
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
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Сервис недоступен');
    expect(result.current.items).toBeNull();
  });

  it('сбой запроса экзаменов не ломает ленту', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([UNREAD]);
    expect(result.current.error).toBeNull();
    expect(result.current.newTasks).toEqual([]);
  });
});

// Баг, который чинит этот файл: у штата школы (teacher/assistant/admin)
// попыток экзамена нет, а до ADR-0074 хук всё равно звал useMyExams() за
// любую роль — getExamAction() на каждой опубликованной форме отвечал
// 'start' (попыток не было ⇒ «начать»), и эти формы утекали в newTasks и в
// count. Цифра на значке врала, а на /notifications висели чужие карточки
// экзаменов. Ниже проверяется не только итог (count/newTasks), но и что
// запроса по MY_EXAMS_PATH не было вовсе — это гарантия именно от
// `enabled` у useMyExams, а не от фильтра после ответа: фильтр дал бы тот
// же пустой newTasks и на включённом запросе с пустым ответом сервера.
describe('useNotificationsData — штат школы', () => {
  it.each(['teacher', 'assistant', 'admin'] as const)(
    '%s — count только из ленты, newTasks пуст, запроса за экзаменами нет',
    async (role) => {
      mockApiByPath({
        [MY_EXAMS_PATH]: [NEW_EXAM],
        [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
      });
      const { result } = renderHook(() => useNotificationsData(staffMe(role)));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.count).toBe(1);
      expect(result.current.newTasks).toEqual([]);
      expect(examsCallCount()).toBe(0);
    },
  );

  // Ассистент часто и сам ученик школы — вывод решения, не отдельная ветка
  // кода: аккаунт у него один, и isTeacher() видит роль 'assistant' точно
  // так же, как у teacher/admin выше, — запрос экзаменов в счётчике
  // выключен. Сам экран «Задания» это не трогает: TasksScreen.tsx зовёт
  // useMyExams() без опций, маршрут /tasks открыт любой роли
  // (screenAccess.ts) — там ассистент по-прежнему увидит форму и начнёт её
  // (проверяет TasksScreen.test.tsx, не этот файл).
  it('ассистент, который сам учится, экзамены видит на «Заданиях», но не в счётчике', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderHook(() => useNotificationsData(staffMe('assistant')));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.count).toBe(1);
    expect(examsCallCount()).toBe(0);
  });
});

describe('useNotificationsData — опрос (ADR-0076)', () => {
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
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
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

  // Пара к «штату школы» выше: выключенный запрос экзаменов обязан остаться
  // выключенным и через минуту — иначе опрос вернул бы ровно то хождение за
  // экзаменами штата, которое убрал ADR-0074.
  it('у штата школы тик обновляет ленту, но за экзаменами не ходит', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderHook(() => useNotificationsData(staffMe('teacher')));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const feedBefore = feedCallCount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_INTERVAL_MS);
    });

    expect(feedCallCount()).toBe(feedBefore + 1);
    expect(examsCallCount()).toBe(0);
    expect(result.current.newTasks).toEqual([]);
  });

  it('пока вкладка скрыта — новых запросов нет', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [], [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1) });
    const { result } = renderHook(() => useNotificationsData(STUDENT_ME));
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
