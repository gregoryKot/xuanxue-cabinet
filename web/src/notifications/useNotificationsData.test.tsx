import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
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
import { MyExamsProvider } from '../student/MyExamsProvider';
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
// Уже сдан на проверку — не «новое», getMyExamAction возвращает не 'start'.
const STARTED_EXAM: MyExamDto = {
  id: 'e2',
  title: 'Форма 2',
  description: '',
  level: '1',
  attemptsAllowed: 3,
  attemptsUsed: 1,
  lastAttempt: { id: 'a1', status: 'submitted', expired: false },
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
 * `enabled` у MyExamsProvider (роль + путь, ADR-0074), а не фильтр newTasks
 * после ответа: фильтр дал бы тот же пустой newTasks и на включённом запросе
 * с пустым ответом сервера, а настоящая гарантия — что запрос вообще не
 * ушёл. Ноль здесь же стережёт, что тик опроса не будит выключенный запрос
 * (ADR-0076): тихий refresh() на выключенном хуке молчит. */
function examsCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === MY_EXAMS_PATH).length;
}

// useNotificationsData читает экзамены из MyExamsProvider (ADR-0063) — хук
// вне этого контекста бросает ошибку, а провайдеру нужен Router (он решает
// `enabled` по текущему пути — MyExamsProvider.tsx, ADR-0074). Ни один тест
// этого файла не заходит на «/tasks», поэтому у штата школы запрос остаётся
// выключенным ровно `!isTeacher(me)`-условием — путь тут не участвует.
function renderNotificationsData(me: MeDto | null) {
  return renderHook(() => useNotificationsData(me), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter>
        <MyExamsProvider me={me}>{children}</MyExamsProvider>
      </MemoryRouter>
    ),
  });
}

describe('useNotificationsData — счётчик', () => {
  it('складывает непрочитанные строки и новые задания', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM, STARTED_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD, READ], 1),
    });
    const { result } = renderNotificationsData(STUDENT_ME);
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
    const { result } = renderNotificationsData(STUDENT_ME);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(result.current.unreadCount).toBe(60));
    expect(result.current.count).toBe(60);
  });

  it('прочитанные строки в счётчик не идут', async () => {
    mockApiByPath({ [MY_EXAMS_PATH]: [], [NOTIFICATIONS_FEED_PATH]: page([READ], 0) });
    const { result } = renderNotificationsData(STUDENT_ME);
    await waitFor(() => expect(result.current.loading).toBe(false));

    await waitFor(() => expect(result.current.count).toBe(0));
  });
});

// ADR-0087: оба эндпоинта отдают InboxPageDto целиком (тем же
// InboxService.list(), что и GET /me/inbox) — applyData кладёт ответ записи
// на экран напрямую. Второго GET быть не должно: он и был той лишней
// секундой на каждое нажатие, которую чинит ADR-0087.
describe('useNotificationsData — markRead/markAllRead (ответ записи на экране)', () => {
  it('markRead — ровно один POST, второго GET нет, лента из его ответа', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderNotificationsData(STUDENT_ME);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    const afterRead = page([{ ...UNREAD, readAt: '2026-09-20T04:05:00.000Z' }], 0);
    // Ответ действия мокается отдельным вызовом mockApiByPath (см. комментарий
    // в test-support/apiFetchMock.ts) — путь действия и путь начальной
    // загрузки разные, порядок вызовов apiFetch ни на что не влияет. Если бы
    // код всё ещё звал reload(), второй запрос по адресу ленты остался бы
    // без мока и упал на «неожиданный путь».
    mockApiByPath({ [notificationReadPath(UNREAD.id)]: afterRead });

    await result.current.markRead(UNREAD.id);

    expect(mockedApiFetch).toHaveBeenCalledTimes(callsBefore + 1);
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      notificationReadPath(UNREAD.id),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(feedCallCount()).toBe(1); // только начальная загрузка
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.items).toEqual(afterRead.items);
  });

  it('markAllRead — ровно один POST на read-all, второго GET нет, лента из его ответа', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderNotificationsData(STUDENT_ME);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    const afterAllRead = page([{ ...UNREAD, readAt: '2026-09-20T04:05:00.000Z' }], 0);
    mockApiByPath({ [NOTIFICATIONS_READ_ALL_PATH]: afterAllRead });

    await result.current.markAllRead();

    expect(mockedApiFetch).toHaveBeenCalledTimes(callsBefore + 1);
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      NOTIFICATIONS_READ_ALL_PATH,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(feedCallCount()).toBe(1);
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.items).toEqual(afterAllRead.items);
  });
});

describe('useNotificationsData — ошибки', () => {
  it('ошибка ленты отдаёт error и items === null', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
    });
    const { result } = renderNotificationsData(STUDENT_ME);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Сервис недоступен');
    expect(result.current.items).toBeNull();
  });

  it('сбой запроса экзаменов не ломает ленту', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderNotificationsData(STUDENT_ME);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([UNREAD]);
    expect(result.current.error).toBeNull();
    expect(result.current.newTasks).toEqual([]);
  });
});

// Баг, который чинит этот файл: у штата школы (teacher/assistant/admin)
// попыток экзамена нет, а до ADR-0074 хук всё равно звал useMyExams() за
// любую роль — getMyExamAction() на каждой опубликованной форме отвечал
// 'start' (попыток не было ⇒ «начать»), и эти формы утекали в newTasks и в
// count. Цифра на значке врала, а на /notifications висели чужие карточки
// экзаменов. Ниже проверяется не только итог (count/newTasks), но и что
// запроса по MY_EXAMS_PATH не было вовсе — это гарантия именно от `enabled`
// у MyExamsProvider (роль решает сам запрос — ADR-0074), а не от фильтра
// после ответа: фильтр дал бы тот же пустой newTasks и на включённом запросе
// с пустым ответом сервера.
describe('useNotificationsData — штат школы', () => {
  it.each(['teacher', 'assistant', 'admin'] as const)(
    '%s — count только из ленты, newTasks пуст, запроса за экзаменами нет',
    async (role) => {
      mockApiByPath({
        [MY_EXAMS_PATH]: [NEW_EXAM],
        [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
      });
      const { result } = renderNotificationsData(staffMe(role));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.count).toBe(1);
      expect(result.current.newTasks).toEqual([]);
      expect(examsCallCount()).toBe(0);
    },
  );

  // Ассистент часто и сам ученик школы — вывод решения, не отдельная ветка
  // кода: аккаунт у него один, и isTeacher() видит роль 'assistant' точно
  // так же, как у teacher/admin выше, — запрос экзаменов в счётчике
  // выключен. Сам экран «Задания» это не трогает: MyExamsProvider включает
  // запрос на «/tasks» для любой роли (маршрут открыт всем — screenAccess.ts),
  // а useNotificationsData всё равно не посчитает эти формы «новыми» для
  // штата — там ассистент по-прежнему увидит форму и начнёт её (проверяет
  // TasksScreen.test.tsx, не этот файл).
  it('ассистент, который сам учится, экзамены видит на «Заданиях», но не в счётчике', async () => {
    mockApiByPath({
      [MY_EXAMS_PATH]: [NEW_EXAM],
      [NOTIFICATIONS_FEED_PATH]: page([UNREAD], 1),
    });
    const { result } = renderNotificationsData(staffMe('assistant'));
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
    const { result } = renderNotificationsData(STUDENT_ME);
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
    const { result } = renderNotificationsData(staffMe('teacher'));
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
    const { result } = renderNotificationsData(STUDENT_ME);
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
