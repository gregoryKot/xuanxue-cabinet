// Подсказка в ленте «отметьте свои занятия» (LessonScopeHint.tsx, ADR-0185): кому
// она показывается, что в ней написано и куда ведёт. Лента вокруг неё — в
// NotificationsScreen.test.tsx; правила показа без React — в
// lessonReminderVisibility.test.ts.
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  REMINDER_SYNC_VERSION,
  type MeDto,
  type NotificationKind,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeMe } from '../test-support/meFixture';
import { LESSON_ID, MORNING_ID } from '../test-support/reminderSyncFixtures';
import { LessonScopeHint } from './LessonScopeHint';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const SYNC_PATH = '/me/notifications/lessons/sync';
const PREFS_PATH = '/me/notifications';
const REGION_NAME = 'О каких занятиях напоминать';
const SOON: NotificationKind = 'lesson_soon';

const STUDENT = makeMe({ roles: [] });

const catalogue: ReminderSyncSnapshot['classes'] = [
  {
    id: MORNING_ID,
    title: 'Утро',
    groupLabel: '',
    tz: 'Asia/Jerusalem',
    slots: [{ weekday: 1, time: '07:00', durationMin: 60 }],
  },
];

const snapshot = (over: Partial<ReminderSyncSnapshot> = {}): ReminderSyncSnapshot => ({
  version: REMINDER_SYNC_VERSION,
  accountId: STUDENT.id,
  revision: '0',
  classIds: [],
  lessonIds: [],
  leadMinutes: null,
  schoolMinutes: 60,
  classes: catalogue,
  ...over,
});

interface Served {
  me?: MeDto;
  sync?: unknown;
  enabled?: NotificationKind[];
}

// Узкий путь раньше широкого: `mockApiByPath` берёт первое совпадение по
// префиксу, а `/me/notifications/lessons/sync` начинается с `/me/notifications`.
function serve({ me = STUDENT, sync = snapshot(), enabled = [SOON] }: Served = {}) {
  mockApiByPath({
    '/auth/me': me,
    [SYNC_PATH]: sync,
    [PREFS_PATH]: { enabled },
  });
}

function renderHint() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LessonScopeHint />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const callsTo = (path: string) =>
  mockedApiFetch.mock.calls.filter(([called]) => called === path);
const writes = () =>
  mockedApiFetch.mock.calls.filter(
    ([, init]) =>
      (init as { method?: string } | undefined)?.method !== undefined &&
      (init as { method?: string }).method !== 'GET',
  );
const findCard = () => screen.findByRole('complementary', { name: REGION_NAME });
const queryCard = () => screen.queryByRole('complementary', { name: REGION_NAME });

/** Оба ответа получены и разобраны: без этого «карточки нет» верно и пока
 * запросы ещё в пути. */
async function waitForLoaded() {
  await waitFor(() => {
    expect(callsTo(SYNC_PATH)).toHaveLength(1);
    expect(callsTo(PREFS_PATH)).toHaveLength(1);
  });
  await act(() => Promise.resolve());
}

describe('LessonScopeHint — когда показывается', () => {
  it('ничего не отмечено, напоминания включены, занятия в школе есть: что будет и что нажать', async () => {
    serve();
    renderHint();

    const card = await findCard();

    expect(card).toHaveTextContent(
      'Напоминаний о занятиях не будет, пока вы не отметите свои',
    );
    expect(screen.getByText('не будет').tagName).toBe('STRONG');
    expect(card).toHaveTextContent('Отметьте занятия, о которых хотите знать');
    expect(screen.getByRole('link', { name: 'Выбрать занятия' })).toBeVisible();
  });

  it('единственное действие — «Выбрать занятия», ведёт в настройки уведомлений', async () => {
    serve();
    renderHint();

    await findCard();

    expect(screen.getByRole('link', { name: 'Выбрать занятия' })).toHaveAttribute(
      'href',
      '/notifications/settings',
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ничего не пишет в сеть: только чтение снимка и настроек', async () => {
    serve();
    renderHint();

    await findCard();

    expect(writes()).toHaveLength(0);
  });

  it('выбрано занятие расписания — карточки нет', async () => {
    serve({ sync: snapshot({ classIds: [MORNING_ID] }) });
    renderHint();

    await waitForLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it('выбрано отдельное занятие — карточки нет', async () => {
    serve({ sync: snapshot({ lessonIds: [LESSON_ID] }) });
    renderHint();

    await waitForLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it('«Занятие скоро» выключено — карточки нет', async () => {
    serve({ enabled: [] });
    renderHint();

    await waitForLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it('в расписании школы нет занятий — карточки нет: отмечать нечего', async () => {
    serve({ sync: snapshot({ classes: [] }) });
    renderHint();

    await waitForLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — карточки нет и за снимком никто не ходит',
    async (role) => {
      serve({ me: makeMe({ roles: [role] }) });
      renderHint();

      await waitFor(() =>
        expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
      );
      await act(() => Promise.resolve());
      expect(queryCard()).not.toBeInTheDocument();
      expect(callsTo(SYNC_PATH)).toHaveLength(0);
    },
  );

  it('сбой чтения снимка — карточки нет и ошибки на экране нет: данные второстепенные', async () => {
    serve({ sync: new ApiError('Сервер не отвечает.', 500, 'unknown') });
    renderHint();

    await waitForLoaded();
    expect(queryCard()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Сервер не отвечает/)).not.toBeInTheDocument();
  });

  it('снимок не по контракту — карточки нет', async () => {
    serve({ sync: { version: 99 } });
    renderHint();

    await waitForLoaded();
    expect(queryCard()).not.toBeInTheDocument();
  });

  it('пока данные в пути — ничего: ни карточки, ни скелетона', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === SYNC_PATH) return new Promise(() => undefined);
      if (path === PREFS_PATH) return Promise.resolve({ enabled: [SOON] });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const { container } = renderHint();

    await waitFor(() => expect(callsTo(SYNC_PATH)).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });
});
