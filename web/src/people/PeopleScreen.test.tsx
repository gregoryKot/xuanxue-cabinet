// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») и useAuth (экран
// сравнивает id строки с me.id, чтобы найти себя) — по образцу
// summary/SummaryScreen.test.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import PeopleScreen from './PeopleScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    me: { id: 'admin-1', name: 'Маша', roles: ['admin'], tz: 'Asia/Jerusalem' },
    status: 'ok',
    refresh: vi.fn(),
    clear: vi.fn(),
  }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

function makePerson(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u1',
    name: 'Гриша',
    roles: [],
    status: 'active',
    hasTelegram: true,
    lastLoginAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <PeopleScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('PeopleScreen — загрузка', () => {
  it('показывает скелетон, пока список не пришёл', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('PeopleScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Попробовать ещё раз», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    mockedApiFetch.mockResolvedValueOnce([makePerson()]);
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Гриша')).toBeInTheDocument();
  });
});

describe('PeopleScreen — пустой список', () => {
  it('только сам admin в базе — честный текст, а не пустой список', async () => {
    mockedApiFetch.mockResolvedValue([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
    ]);

    renderScreen();

    expect(
      await screen.findByText(/Пока никто, кроме вас, не входил/),
    ).toBeInTheDocument();
  });
});

describe('PeopleScreen — список', () => {
  it('строка на каждого человека, включая себя', async () => {
    mockedApiFetch.mockResolvedValue([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [] }),
    ]);

    renderScreen();

    expect(await screen.findByText('Гриша')).toBeInTheDocument();
    expect(screen.getByText('Маша')).toBeInTheDocument();
  });

  it('переключатель роли вызывает PATCH и обновлённая роль видна в списке', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: [] }),
    ]);

    renderScreen();
    await screen.findByText('Гриша');

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([
      makePerson({ id: 'admin-1', name: 'Маша', roles: ['admin'] }),
      makePerson({ id: 'u1', name: 'Гриша', roles: ['teacher'] }),
    ]);

    await user.click(screen.getByLabelText('Учитель — Гриша'));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1',
      expect.objectContaining({ method: 'PATCH', body: { roles: ['teacher'] } }),
    );
    await waitFor(() => expect(screen.getByLabelText('Учитель — Гриша')).toBeChecked());
  });
});
