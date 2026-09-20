// Экран «Уведомления» (ADR-0065) — шапка, рубрики ленты, карточки новых
// заданий, «Прочитать все», пустой экран и предложение связать Telegram.
// Часы заморожены на `Date`, не на всех таймерах (образец — routePrefetch.test.ts):
// только так граница «Сегодня»/«Раньше» устойчива, а userEvent продолжает
// работать на настоящих таймерах.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeDto, MyExamDto, NotificationDto } from '@xuanxue/shared';
import {
  MY_EXAMS_PATH,
  NOTIFICATIONS_FEED_PATH,
  NOTIFICATIONS_READ_ALL_PATH,
  notificationReadPath,
} from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { NotificationsProvider } from './NotificationsProvider';
import NotificationsScreen from './NotificationsScreen';

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
};
const ME_NOT_LINKED: MeDto = {
  ...ME_LINKED,
  telegramLinked: false,
  botChatActive: false,
};

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

function renderScreen(overrides: Record<string, unknown> = {}) {
  mockApiByPath({
    '/auth/me': ME_LINKED,
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 0 },
    '/me/inbox/': undefined, // POST .../read и .../read-all
    ...overrides,
  });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationsProvider>
          <NotificationsScreen />
        </NotificationsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('NotificationsScreen — шапка', () => {
  it('заголовок и объяснение видны', async () => {
    renderScreen();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Уведомления' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Те же события, что уходят вам в Telegram/),
    ).toBeInTheDocument();
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

describe('NotificationsScreen — отметка прочитанной', () => {
  it('клик по непрочитанной строке шлёт POST по её адресу и перечитывает ленту', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    const button = await screen.findByRole('button', { name: /Текст события/ });
    await user.click(button);

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        notificationReadPath('n1'),
        expect.objectContaining({ method: 'POST' }),
      ),
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

    await user.click(await screen.findByRole('button', { name: /Текст события/ }));

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

  it('нажатие шлёт POST на read-all', async () => {
    const user = userEvent.setup();
    renderScreen({
      [NOTIFICATIONS_FEED_PATH]: { items: [makeNotification()], unreadCount: 1 },
    });

    await user.click(await screen.findByRole('button', { name: 'Прочитать все' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        NOTIFICATIONS_READ_ALL_PATH,
        expect.objectContaining({ method: 'POST' }),
      ),
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
      '/tasks',
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
