// Рубрика «События» на доске штата (ADR-0177): ближайшие события карточками-
// ссылками на правку и карточка-плюс «Добавить событие» в конце. Прошедшее с
// доски уходит, хотя GET /events его отдаёт. Сеть — mockApiByPath (ADR-0116).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { StaffBoardEvents } from './StaffBoardEvents';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone('Asia/Jerusalem');

// «Сейчас» доски — new Date() (StaffBoardEvents.tsx): фиксируем, чтобы
// «прошедшее» не зависело от дня запуска теста.
const TODAY = new Date('2030-11-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderEvents() {
  return render(
    <MemoryRouter initialEntries={['/board']}>
      <Routes>
        <Route path="/board" element={<StaffBoardEvents />} />
        <Route path="/events/new" element={<p>Страница нового события</p>} />
        <Route path="/events/:eventId" element={<p>Страница правки</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const SOONER = makeSchoolEvent({
  id: 'sooner',
  title: 'Ретрит в Галилее',
  startsAt: '2030-11-20T08:00:00.000Z',
  endsAt: '2030-11-22T15:00:00.000Z',
  place: 'Кибуц Амиад',
  description: 'Скрыто на карточке штата',
});
const LATER = makeSchoolEvent({
  id: 'later',
  title: 'Семинар по тайцзи',
  startsAt: '2030-12-05T15:00:00.000Z',
});
const PAST = makeSchoolEvent({
  id: 'past',
  title: 'Прошлогодний выезд',
  startsAt: '2030-10-01T08:00:00.000Z',
});

describe('StaffBoardEvents — список', () => {
  it('предстоящие по возрастанию, прошедшее скрыто, плюс последним', async () => {
    // Штат получает список от поздних к ранним, с прошедшими.
    mockApiByPath({ '/events': [LATER, SOONER, PAST] });
    renderEvents();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'События' }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/events/sooner',
      '/events/later',
      '/events/new',
    ]);
    expect(screen.queryByText('Прошлогодний выезд')).toBeNull();

    const first = within(screen.getByRole('link', { name: /Ретрит в Галилее/ }));
    expect(first.getByRole('heading', { name: 'Ретрит в Галилее' })).toBeInTheDocument();
    expect(first.getByText('20–22 ноября')).toBeInTheDocument();
    expect(first.getByText('Кибуц Амиад')).toBeInTheDocument();
    expect(screen.queryByText('Скрыто на карточке штата')).toBeNull();
  });

  it('событие ведёт на свою страницу правки', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events': [SOONER] });
    renderEvents();

    await user.click(await screen.findByRole('link', { name: /Ретрит в Галилее/ }));

    expect(await screen.findByText('Страница правки')).toBeInTheDocument();
  });

  it('плюс «Добавить событие» с подсказкой ведёт на /events/new', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events': [SOONER] });
    renderEvents();

    const plus = await screen.findByRole('link', { name: /Добавить событие/ });
    expect(plus).toHaveTextContent('дату и место увидит каждый ученик');
    await user.click(plus);

    expect(await screen.findByText('Страница нового события')).toBeInTheDocument();
  });
});

describe('StaffBoardEvents — пусто и сбой', () => {
  it('событий нет — только карточка-плюс', async () => {
    mockApiByPath({ '/events': [] });
    renderEvents();

    expect(
      await screen.findByRole('link', { name: /Добавить событие/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('все события прошли — тоже только плюс', async () => {
    mockApiByPath({ '/events': [PAST] });
    renderEvents();

    await screen.findByRole('link', { name: /Добавить событие/ });
    expect(screen.queryByText('Прошлогодний выезд')).toBeNull();
  });

  it('сбой — баннер с «Обновить», плюс на месте; повтор перечитывает список', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/events': new TypeError('Failed to fetch') });
    renderEvents();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить события. Попробуйте ещё раз.',
    );
    expect(screen.getByRole('link', { name: /Добавить событие/ })).toBeInTheDocument();

    mockApiByPath({ '/events': [SOONER] });
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(
      await screen.findByRole('link', { name: /Ретрит в Галилее/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockedApiFetch.mock.calls.filter(([p]) => p === '/events')).toHaveLength(2);
  });
});
