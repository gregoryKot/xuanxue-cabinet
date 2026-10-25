// Сквозной путь событий (ADR-0177), read-after-write: сохранил на странице —
// увидел на доске, удалил — доска перестала показывать. Настоящие хуки доски и
// редактора поверх «сервера» в памяти: GET /events отдаёт то, что записали
// POST/PATCH/DELETE. Свежее состояние доска берёт сама при монтировании
// (ADR-0087), перечитывать после записи нечем и незачем.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateSchoolEventInput, SchoolEventDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { StaffBoardEvents } from '../board/StaffBoardEvents';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import EventEditorScreen from './EventEditorScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2030-11-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

/** «Сервер» событий в памяти: список от поздних к ранним, как у GET /events. */
function fakeEventsServer(initial: SchoolEventDto[]) {
  let events = [...initial];
  mockedApiFetch.mockImplementation(
    (path: string, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST' && path === '/events') {
        const input = init?.body as CreateSchoolEventInput;
        const created = makeSchoolEvent({ id: `new-${events.length}`, ...input });
        events = [created, ...events];
        return Promise.resolve(created);
      }
      if (method === 'DELETE' && path.startsWith('/events/')) {
        events = events.filter((event) => path !== `/events/${event.id}`);
        return Promise.resolve(undefined);
      }
      if (method === 'GET' && path === '/events') return Promise.resolve(events);
      return Promise.reject(new Error(`неожиданный запрос: ${method} ${path}`));
    },
  );
}

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/board']}>
      <Routes>
        <Route path="/board" element={<StaffBoardEvents />} />
        <Route path="/events/new" element={<EventEditorScreen />} />
        <Route path="/events/:eventId" element={<EventEditorScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('события: доска → страница → доска', () => {
  it('созданное событие появляется на доске сразу после сохранения', async () => {
    const user = userEvent.setup();
    fakeEventsServer([]);
    renderFlow();

    await user.click(await screen.findByRole('link', { name: /Добавить событие/ }));
    await user.type(await screen.findByLabelText('Название'), 'Ретрит в Галилее');
    await user.type(screen.getByLabelText('Начало'), '2030-11-14T10:00');
    await user.type(screen.getByLabelText('Место'), 'Кибуц Амиад');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    const card = await screen.findByRole('link', { name: /Ретрит в Галилее/ });
    expect(card).toHaveTextContent('Кибуц Амиад');
    expect(card).toHaveAttribute('href', '/events/new-0');
  });

  it('удалённое событие исчезает с доски после подтверждения', async () => {
    const user = userEvent.setup();
    fakeEventsServer([makeSchoolEvent({ id: 'ev1', title: 'Семинар по тайцзи' })]);
    renderFlow();

    await user.click(await screen.findByRole('link', { name: /Семинар по тайцзи/ }));
    await user.click(await screen.findByRole('button', { name: 'Удалить событие' }));
    await user.click(await screen.findByRole('button', { name: 'Удалить' }));

    expect(
      await screen.findByRole('link', { name: /Добавить событие/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Семинар по тайцзи')).toBeNull();
  });
});
