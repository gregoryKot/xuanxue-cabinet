// Сеть мокается по путям: экран грузит сводку, занятия и классы сразу
// (test-support/apiFetchMock.ts) — очередь mockResolvedValueOnce зависела бы
// от порядка хуков.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto, LessonDto, MeDto, SummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockApiByPath, mockedApiFetch } from '../test-support/apiFetchMock';
import SummaryScreen from './SummaryScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const NON_ADMIN_ME: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
};

// useAuth замокан отдельно от apiFetch (не через реальный AuthProvider):
// он бы сам звал /auth/me и мешал заглушкам ниже.
const mockedUseAuth = vi.fn(() => ({
  me: NON_ADMIN_ME,
  status: 'ok' as const,
  refresh: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => mockedUseAuth() }));

// «Сегодня» считается от текущего дня, поэтому время в тестах фиксировано
// (CLAUDE.md «Детерминизм»): иначе тест про сегодняшнее занятие ломался бы
// в полночь. Сегодняшнее занятие начинается ровно в NOW, а не «в NOW плюс
// семь часов»: CI гоняет vitest ещё и под TZ=Australia/Sydney, где такой
// сдвиг переносит занятие на завтра. Один и тот же момент — один и тот же
// календарный день в любом поясе.
const NOW = new Date('2026-09-08T09:00:00.000Z');
const NEXT_MONTH_ISO = '2026-10-08T09:00:00.000Z';

const EMPTY_SUMMARY: SummaryDto = {
  period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
  broadcastsSent: 0,
  broadcastsCancelled: 0,
  deliveriesFailed: 0,
  deliveriesPending: 0,
  manualWaiting: 0,
  emptyMessage: 'Пока нечего показать.',
};

function makeClass(): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: NOW.toISOString(),
    durationMin: 60,
    topic: 'Пятое занятие',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Сводка + занятия + классы одной строкой: почти каждому тесту нужны все три. */
function mockScreen(summary: unknown, lessons: LessonDto[] = []) {
  mockApiByPath({ '/summary': summary, '/lessons': lessons, '/classes': [makeClass()] });
}

/** Куда увёл переход: MemoryRouter не трогает адрес окна, поэтому маршрут
 * читается из самого роутера. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.hash}`}</span>;
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <SummaryScreen />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  mockedApiFetch.mockReset();
  mockedUseAuth.mockReturnValue({
    me: NON_ADMIN_ME,
    status: 'ok',
    refresh: vi.fn(),
    clear: vi.fn(),
  });
});

describe('SummaryScreen — загрузка', () => {
  it('показывает скелетон, пока сводка не пришла', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('SummaryScreen — сбой загрузки', () => {
  it('ApiError — текст и «Попробовать ещё раз», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockScreen(new ApiError('Сервис недоступен', 503, 'unknown'));

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockScreen({ ...EMPTY_SUMMARY, emptyMessage: 'Пока рассылок не было.' });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Пока рассылок не было.')).toBeInTheDocument();
  });

  it('занятия не загрузились — своя ошибка в блоке «Сегодня», числа остаются', async () => {
    // Не ApiError: у сетевого сбоя свой общий текст useLessons, по нему и
    // видно, что упали именно занятия, а не сводка.
    mockApiByPath({
      '/summary': EMPTY_SUMMARY,
      '/lessons': new Error('network down'),
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить занятия',
    );
    expect(screen.getByText('Пока нечего показать.')).toBeInTheDocument();
  });
});

describe('SummaryScreen — сегодняшний день (отзыв владельца 2026-09-12)', () => {
  it('занятие сегодня — карточка со временем, темой и статусом ссылки', async () => {
    mockScreen(EMPTY_SUMMARY, [
      makeLesson({ broadcast: { status: 'sent', kind: 'lesson_link' } }),
    ]);

    renderScreen();

    expect(await screen.findByText('Сегодня')).toBeInTheDocument();
    expect(screen.getByText(/Тайцзицюань, средняя группа/)).toBeInTheDocument();
    expect(screen.getByText(/Пятое занятие/)).toBeInTheDocument();
    expect(screen.getByText('Ссылка ушла')).toBeInTheDocument();
  });

  it('занятие другого дня в окне — сегодня его нет', async () => {
    mockScreen(EMPTY_SUMMARY, [makeLesson({ id: 'l2', startsAt: NEXT_MONTH_ISO })]);

    renderScreen();

    expect(await screen.findByText('Сегодня занятий нет.')).toBeInTheDocument();
    expect(screen.queryByText(/Пятое занятие/)).not.toBeInTheDocument();
  });

  it('сегодня пусто — ссылка на ближайшее занятие ведёт в «Занятия»', async () => {
    mockScreen({
      ...EMPTY_SUMMARY,
      nextLesson: {
        lessonId: 'l9',
        title: 'Тайцзицюань, средняя группа',
        startsAt: NEXT_MONTH_ISO,
      },
    });

    renderScreen();

    const link = await screen.findByRole('link', { name: /Тайцзицюань/ });
    expect(link).toHaveAttribute('href', '/planning#lesson-l9');
  });

  it('ни сегодня, ни ближайшего — честное «занятий нет» без обрубка фразы', async () => {
    mockScreen(EMPTY_SUMMARY);

    renderScreen();

    expect(await screen.findByText('Сегодня занятий нет.')).toBeInTheDocument();
    expect(screen.queryByText(/Ближайшее/)).not.toBeInTheDocument();
  });

  it('занятия упали и вернулись — «Попробовать ещё раз» перезапрашивает их', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/summary': EMPTY_SUMMARY,
      '/lessons': new Error('network down'),
      '/classes': [makeClass()],
    });

    renderScreen();
    await screen.findByRole('alert');

    mockScreen(EMPTY_SUMMARY, [makeLesson()]);
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText(/Пятое занятие/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('класс занятия ещё не загрузился — «—» вместо пустого места', async () => {
    mockApiByPath({
      '/summary': EMPTY_SUMMARY,
      '/lessons': [makeLesson({ classId: 'неизвестный' })],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText(/—/)).toBeInTheDocument();
  });

  it('клик по сегодняшнему занятию уводит в «Занятия» к этой карточке', async () => {
    const user = userEvent.setup();
    mockScreen(EMPTY_SUMMARY, [makeLesson()]);

    renderScreen();
    await user.click(await screen.findByText(/Пятое занятие/));

    expect(screen.getByTestId('location')).toHaveTextContent('/planning#lesson-l1');
  });
});

describe('SummaryScreen — пустая база', () => {
  it('честное emptyMessage вместо карточек', async () => {
    mockScreen(EMPTY_SUMMARY);

    renderScreen();

    expect(await screen.findByText('Пока нечего показать.')).toBeInTheDocument();
    expect(screen.queryByText('Рассылок отправлено')).not.toBeInTheDocument();
  });
});

describe('SummaryScreen — числа за период', () => {
  it('карточки со значениями, ручные доставки без ссылки, отмены — в журнал', async () => {
    mockScreen({
      period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
      broadcastsSent: 12,
      broadcastsCancelled: 5,
      deliveriesFailed: 1,
      deliveriesPending: 2,
      manualWaiting: 3,
    });

    renderScreen();

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('За 30 дней')).toBeInTheDocument();
    expect(screen.getByText('Ждут отправки вручную').closest('a')).toBeNull();
    expect(screen.getByText('Отменено автоматикой').closest('a')).toHaveAttribute(
      'href',
      '/broadcasts?status=cancelled',
    );
  });
});

describe('SummaryScreen — вход на «Люди»', () => {
  it('учитель без admin — ссылки «Люди» нет', async () => {
    mockScreen(EMPTY_SUMMARY);

    renderScreen();

    await screen.findByText('Пока нечего показать.');
    expect(screen.queryByRole('link', { name: 'Люди' })).not.toBeInTheDocument();
  });

  it('admin — ссылка «Люди» ведёт на /people', async () => {
    mockedUseAuth.mockReturnValue({
      me: { id: 'u2', name: 'Маша', roles: ['admin'], tz: 'Asia/Jerusalem' },
      status: 'ok',
      refresh: vi.fn(),
      clear: vi.fn(),
    });
    mockScreen(EMPTY_SUMMARY);

    renderScreen();

    const link = await screen.findByRole('link', { name: 'Люди' });
    expect(link).toHaveAttribute('href', '/people');
    expect(
      screen.getByText('кто вошёл в кабинет и кто ведёт занятия'),
    ).toBeInTheDocument();
  });
});
