// Учитель на «Люди» (ADR-0030, уточнение владельца 2026-09-15): видит
// ссылку-приглашение, не список учеников — GET /users остаётся admin
// (SECURITY §3), звать его от имени учителя незачем (usePeople(isAdmin)).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import PeopleScreen from './PeopleScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    me: { id: 't1', name: 'Дима', roles: ['teacher'], tz: 'Asia/Jerusalem' },
    status: 'ok',
    refresh: vi.fn(),
    clear: vi.fn(),
  }),
}));

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <PeopleScreen />
    </MemoryRouter>,
  );
}

describe('PeopleScreen — учитель', () => {
  it('видит карточку ссылки-приглашения, текст про admin, не зовёт GET /users', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/users/invite-link') return Promise.resolve({ url: null });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Ссылка-приглашение')).toBeInTheDocument();
    // Приписка про роли — админская: учителю назначать некого.
    expect(screen.queryByText(/Отметьте, кто ведёт занятия/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Список учеников и назначение ролей видит только администратор/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Пока никто, кроме вас, не входил.', { exact: false }),
    ).not.toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      expect.stringMatching(/^\/users\?/),
      expect.anything(),
    );
  });
});
