// Экран «Уведомления» (ADR-0063) — шапка, рубрики ленты, карточки новых
// заданий, «Прочитать все», пустой экран и предложение связать Telegram.
// Часы заморожены на `Date`, не на всех таймерах (образец — routePrefetch.test.ts):
// только так граница «Сегодня»/«Раньше» устойчива, а userEvent продолжает
// работать на настоящих таймерах.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REMINDER_SYNC_VERSION,
  type MeDto,
  type MyExamDto,
  type NotificationDto,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import {
  MY_EXAMS_PATH,
  NOTIFICATION_PREFS_PATH,
  NOTIFICATIONS_FEED_PATH,
} from '../api/apiPaths';
import { apiRoutePath } from '../api/apiRoute';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { REMINDER_SYNC_PATH } from '../api/lessonScopePaths';
import { AuthProvider } from '../auth/AuthProvider';
import { MyExamsProvider } from '../student/MyExamsProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { NotificationsProvider } from './NotificationsProvider';
import NotificationsScreen from './NotificationsScreen';

// Пути действий ленты — из карты маршрутов (PLAN §17.1), тем же
// apiRoutePath, что собирает путь в apiRoute хука.
const NOTIFICATIONS_READ_ALL_PATH = apiRoutePath('POST /me/inbox/read-all');
const notificationItemPath = (id: string): string =>
  apiRoutePath('DELETE /me/inbox/:id', { params: { id } });
const notificationReadPath = (id: string): string =>
  apiRoutePath('POST /me/inbox/:id/read', { params: { id } });

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-20T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const ME_LINKED: MeDto = {
  id: 'u1',
  name: 'Ученица',
  roles: [],
  status: 'active',
  telegramLinked: true,
  botChatActive: true,
  hasEmail: false,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
  studentMode: false,
  canUseStudentMode: false,
  homeHiddenTiles: [],
};
const ME_NOT_LINKED: MeDto = {
  ...ME_LINKED,
  telegramLinked: false,
  botChatActive: false,
};

// Строка сама теперь обёрнута в SwipeRow (просьба владельца 2026-09-22) — у
// неё под содержимым всегда есть вторая кнопка «Убрать», имя которой тоже
// содержит текст события (CLAUDE.md «Доступность»). Поиск по одному тексту
// события находил бы обе — уточняем именем собственной кнопки строки.
const UNREAD_BUTTON_NAME = /^Не прочитано/;

function makeNotification(overrides: Partial<NotificationDto> = {}): NotificationDto {
  return {
    id: 'n1',
    kind: 'post_draft',
    text: 'Текст события',
    createdAt: '2026-09-20T09:00:00.000Z', // сегодня по Москве (зритель теста)
    ...overrides,
  };
}

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма 1',
    description: '',
    level: '1',
    attemptsAllowed: 3,
    attemptsUsed: 0,
    ...overrides,
  };
}

// Подсказка «отметьте свои занятия» (ADR-0185) читает снимок напоминаний и
// настройки уведомлений у каждого ученика. По умолчанию занятие уже отмечено —
// подсказки нет, и остальные тесты ленты её не видят; тесты подсказки
// подставляют свой снимок.
const reminderSnapshot = (
  overrides: Partial<ReminderSyncSnapshot> = {},
): ReminderSyncSnapshot => ({
  version: REMINDER_SYNC_VERSION,
  accountId: 'u1',
  revision: '1',
  classIds: ['c1'],
  lessonIds: [],
  leadMinutes: null,
  schoolMinutes: 60,
  classes: [
    {
      id: 'c1',
      title: 'Цигун',
      groupLabel: '',
      tz: 'Asia/Jerusalem',
      slots: [{ weekday: 1, time: '19:00', durationMin: 60 }],
    },
  ],
  ...overrides,
});

// Узкий путь раньше широкого: `mockApiByPath` берёт первое совпадение по
// префиксу, а снимок начинается с `/me/notifications`.
function renderScreen(overrides: Record<string, unknown> = {}, me: MeDto = ME_LINKED) {
  mockApiByPath({
    '/auth/me': me,
    [REMINDER_SYNC_PATH]: reminderSnapshot(),
    [NOTIFICATION_PREFS_PATH]: { enabled: ['lesson_soon'] },
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 0 },
    '/me/inbox/': undefined, // POST .../read и .../read-all
    ...overrides,
  });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <MyExamsProvider me={me}>
          <NotificationsProvider me={me}>
            <NotificationsScreen />
          </NotificationsProvider>
        </MyExamsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('NotificationsScreen — шапка', () => {
  it('заголовок виден', async () => {
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Уведомления' }),
    ).toBeInTheDocument();
  });
});

// Вход в «Настройки уведомлений» (ADR-0162): в ленту приходят с вопросом «почему
// мне это пишут», и настройка должна быть под рукой — и при событиях, и при
// пустой ленте.
describe('NotificationsScreen — ссылка на настройки (ADR-0162)', () => {
  it('в ленте с событиями — тихая ссылка «Настройки уведомлений» ведёт на /notifications/settings', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    await screen.findByText('Текст события');
    expect(screen.getByRole('link', { name: 'Настройки уведомлений' })).toHaveAttribute(
      'href',
      '/notifications/settings',
    );
  });

  it('при пустой ленте ссылка тоже есть', async () => {
    renderScreen();

    await screen.findByText('Уведомлений пока нет.');
    expect(screen.getByRole('link', { name: 'Настройки уведомлений' })).toHaveAttribute(
      'href',
      '/notifications/settings',
    );
  });

  it('ссылка стоит после ленты, а не над ней', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const row = await screen.findByText('Текст события');
    const link = screen.getByRole('link', { name: 'Настройки уведомлений' });
    expect(
      row.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

// Подсказка «отметьте свои занятия» (LessonScopeHint.tsx, ADR-0185): тексты и
// ссылка — в LessonScopeHint.test.tsx, здесь её место в ленте и то, что сбой
// второстепенных данных ленту не трогает.
describe('NotificationsScreen — подсказка «отметьте свои занятия»', () => {
  const HINT_TEXT = 'не будет';
  const unchosen = reminderSnapshot({ classIds: [] });
  const syncGets = () =>
    mockedApiFetch.mock.calls.filter(([path]) => path === REMINDER_SYNC_PATH);

  it('стоит самой первой: над карточкой нового задания и над лентой', async () => {
    renderScreen({
      [REMINDER_SYNC_PATH]: unchosen,
      [MY_EXAMS_PATH]: [makeExam()],
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const hint = await screen.findByText(HINT_TEXT);
    const task = await screen.findByText('Новое задание');
    const row = await screen.findByText('Текст события');
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(hint.compareDocumentPosition(task) & FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(row) & FOLLOWING).toBeTruthy();
  });

  it('и при пустой ленте', async () => {
    renderScreen({ [REMINDER_SYNC_PATH]: unchosen });

    expect(await screen.findByText(HINT_TEXT)).toBeInTheDocument();
    expect(await screen.findByText('Уведомлений пока нет.')).toBeInTheDocument();
  });

  it('занятие отмечено — подсказки нет', async () => {
    renderScreen();

    await screen.findByText('Уведомлений пока нет.');
    await waitFor(() => expect(syncGets()).toHaveLength(1));
    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
  });

  it('штат — подсказки нет и за снимком лента не ходит', async () => {
    const teacher: MeDto = { ...ME_LINKED, roles: ['teacher'] };
    renderScreen({ [REMINDER_SYNC_PATH]: unchosen }, teacher);

    await screen.findByText('Уведомлений пока нет.');
    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    expect(syncGets()).toHaveLength(0);
  });

  it('снимок не загрузился — ни подсказки, ни баннера ошибки: лента живёт без неё', async () => {
    renderScreen({
      [REMINDER_SYNC_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    await screen.findByText('Текст события');
    await waitFor(() => expect(syncGets()).toHaveLength(1));
    expect(screen.queryByText(HINT_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
describe('NotificationsScreen — рубрики ленты', () => {
  it('сегодняшняя строка — рубрика «Сегодня», «Раньше» не рисуется', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    expect(await screen.findByText('Сегодня')).toBeInTheDocument();
    expect(screen.queryByText('Раньше')).not.toBeInTheDocument();
  });

  it('строка прошлых дней — рубрика «Раньше», «Сегодня» не рисуется', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: {
        items: [makeNotification({ id: 'n2', createdAt: '2026-09-10T09:00:00.000Z' })],
        unreadCount: 1,
      },
    });

    expect(await screen.findByText('Раньше')).toBeInTheDocument();
    expect(screen.queryByText('Сегодня')).not.toBeInTheDocument();
  });
});

describe('NotificationsScreen — ссылка на предмет (ADR-0070)', () => {
  it('строка exam_result в ленте нарисована ссылкой на «/tasks»', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: {
        items: [makeNotification({ kind: 'exam_result' })],
        unreadCount: 1,
      },
    });

    expect(await screen.findByRole('link', { name: /Текст события/ })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });
});

describe('NotificationsScreen — отметка прочитанной (ответ записи на экране, ADR-0087)', () => {
  it('клик по непрочитанной строке шлёт один POST и берёт ленту из его ответа', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const button = await screen.findByRole('button', { name: UNREAD_BUTTON_NAME });
    // Ответ действия — отдельный вызов mockApiByPath поверх начального (см.
    // комментарий в test-support/apiFetchMock.ts): без него POST ответил бы
    // пустым телом, и applyData уронил бы ленту в undefined.
    mockApiByPath({
      [notificationReadPath('n1')]: {
        items: [makeNotification({ readAt: '2026-09-20T09:05:00.000Z' })],
        unreadCount: 0,
      },
    });
    await user.click(button);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        notificationReadPath('n1'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    // unreadCount взят из ответа записи, без второго GET — «Прочитать все»
    // пропадает без похода в сеть за лентой ещё раз.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Прочитать все' }),
      ).not.toBeInTheDocument(),
    );
  });

  // Рубрики рисуются двумя разными вызовами NotificationGroup, и обработчик
  // нажатия у каждой свой — строка из «Раньше» проверяется отдельно.
  it('клик по строке из рубрики «Раньше» тоже шлёт POST по её адресу', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: {
        items: [makeNotification({ id: 'n9', createdAt: '2026-09-10T09:00:00.000Z' })],
        unreadCount: 1,
      },
    });

    const button = await screen.findByRole('button', { name: UNREAD_BUTTON_NAME });
    mockApiByPath({
      [notificationReadPath('n9')]: {
        items: [
          makeNotification({
            id: 'n9',
            createdAt: '2026-09-10T09:00:00.000Z',
            readAt: '2026-09-20T09:05:00.000Z',
          }),
        ],
        unreadCount: 0,
      },
    });
    await user.click(button);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        notificationReadPath('n9'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});

describe('NotificationsScreen — «Прочитать все»', () => {
  it('видно, когда есть непрочитанные строки', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    expect(
      await screen.findByRole('button', { name: 'Прочитать все' }),
    ).toBeInTheDocument();
  });

  it('нажатие шлёт POST на read-all и берёт ленту из его ответа', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const markAllButton = await screen.findByRole('button', { name: 'Прочитать все' });
    mockApiByPath({
      [NOTIFICATIONS_READ_ALL_PATH]: {
        items: [makeNotification({ readAt: '2026-09-20T09:05:00.000Z' })],
        unreadCount: 0,
      },
    });
    await user.click(markAllButton);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        NOTIFICATIONS_READ_ALL_PATH,
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Прочитать все' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('не видно, когда непрочитанных нет', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: {
        items: [makeNotification({ readAt: '2026-09-20T09:05:00.000Z' })],
        unreadCount: 0,
      },
    });

    await screen.findByText('Текст события');
    expect(
      screen.queryByRole('button', { name: 'Прочитать все' }),
    ).not.toBeInTheDocument();
  });
});

describe('NotificationsScreen — новые задания', () => {
  it('карточка видна и ведёт на «Задания»', async () => {
    renderScreen({ [MY_EXAMS_PATH]: [makeExam()] });

    expect(await screen.findByText('Новое задание')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Форма 1/ })).toHaveAttribute(
      'href',
      '/tasks?start=e1',
    );
  });
});

describe('NotificationsScreen — пустой экран', () => {
  it('честная фраза и предложение связать Telegram, когда чата с ботом нет', async () => {
    renderScreen({ '/auth/me': ME_NOT_LINKED });

    expect(await screen.findByText('Уведомлений пока нет.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
  });

  it('чат с ботом уже есть — предложения связать Telegram нет', async () => {
    renderScreen();

    await screen.findByText('Уведомлений пока нет.');
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });
});

// Лента непустая, но чата с ботом всё равно нет — предложение не привязано к
// пустому экрану, оно ниже ленты, за волосяной линией (telegramRowStyle).
describe('NotificationsScreen — предложение связать Telegram под непустой лентой', () => {
  it('строки есть, чата с ботом нет — предложение видно под лентой', async () => {
    renderScreen({
      '/auth/me': ME_NOT_LINKED,
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    await screen.findByText('Текст события');
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
  });
});

describe('NotificationsScreen — ошибка загрузки', () => {
  it('баннер с «Обновить» вместо ленты', async () => {
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
    expect(alert).toHaveTextContent('Сервис недоступен');
  });

  it('«Обновить» перечитывает ленту, и она показывается', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    const alert = await screen.findByRole('alert');
    // Вторая попытка удаётся: баннер уступает место самой ленте.
    mockApiByPath({
      '/auth/me': ME_LINKED,
      [MY_EXAMS_PATH]: [],
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
      '/me/inbox/': undefined,
    });
    await user.click(within(alert).getByRole('button', { name: 'Обновить' }));

    expect(await screen.findByText('Текст события')).toBeInTheDocument();
  });
});

// Аудит 2026-09-21 (MED): markRead/markAllRead звались `void ...(...)` без
// `.catch` — отказ на плохой связи был необработанным promise rejection, и
// клик/«Прочитать все» молча ничего не делали. Баннер — тот же LoadErrorBanner,
// что у ошибки загрузки выше (CLAUDE.md «Одна механика — один компонент»).
describe('NotificationsScreen — сбой отметки прочитанной', () => {
  it('клик по непрочитанной строке не прошёл — баннер, строка осталась непрочитанной', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const button = await screen.findByRole('button', { name: UNREAD_BUTTON_NAME });
    mockApiByPath({
      [notificationReadPath('n1')]: new ApiError('Сервис недоступен', 503, 'unknown'),
    });
    await user.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Сервис недоступен');
    // Счётчик не сброшен молча: «Прочитать все» всё ещё на месте.
    expect(screen.getByRole('button', { name: 'Прочитать все' })).toBeInTheDocument();
  });

  it('«Прочитать все» не прошло — тот же баннер', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const markAllButton = await screen.findByRole('button', { name: 'Прочитать все' });
    mockApiByPath({
      [NOTIFICATIONS_READ_ALL_PATH]: new ApiError('Сервис недоступен', 503, 'unknown'),
    });
    await user.click(markAllButton);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Сервис недоступен');
  });
});

// Просьба владельца 2026-09-22: «уведомление нельзя смахнуть, удалить» —
// кнопка «Убрать» всегда в DOM под строкой (SwipeRow.tsx), клик по ней и без
// жеста шлёт DELETE и берёт ленту из его ответа (ADR-0087), а не отдельным GET.
describe('NotificationsScreen — «Убрать» (SwipeRow, DELETE /me/inbox/:id)', () => {
  it('клик по «Убрать» шлёт DELETE и берёт ленту из его ответа', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const dismissButton = await screen.findByRole('button', { name: /^Убрать/ });
    // Счёт вызовов ленты ДО действия — единственный, от первой загрузки
    // экрана; ниже проверяем, что DELETE его не прибавил.
    const feedCallsBefore = mockedApiFetch.mock.calls.filter(
      ([path]) => path === NOTIFICATIONS_FEED_PATH,
    ).length;
    mockApiByPath({
      [notificationItemPath('n1')]: { items: [], unreadCount: 0 },
    });
    await user.click(dismissButton);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        notificationItemPath('n1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    // Лента перерисована из ответа DELETE (пустой список) — строка пропадает.
    expect(await screen.findByText('Уведомлений пока нет.')).toBeInTheDocument();
    const feedCallsAfter = mockedApiFetch.mock.calls.filter(
      ([path]) => path === NOTIFICATIONS_FEED_PATH,
    ).length;
    expect(feedCallsAfter).toBe(feedCallsBefore);
  });

  // Рубрики — два разных вызова NotificationGroup со своими обработчиками:
  // «Убрать» у строки из «Раньше» проверяется отдельно (без этого теста
  // обработчик второй рубрики оставался непокрытым, храповик функций web).
  it('«Убрать» у строки из «Раньше» тоже шлёт DELETE по её адресу', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: {
        items: [makeNotification({ id: 'n9', createdAt: '2026-09-10T09:00:00.000Z' })],
        unreadCount: 1,
      },
    });

    const dismissButton = await screen.findByRole('button', { name: /^Убрать/ });
    mockApiByPath({
      [notificationItemPath('n9')]: { items: [], unreadCount: 0 },
    });
    await user.click(dismissButton);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        notificationItemPath('n9'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
