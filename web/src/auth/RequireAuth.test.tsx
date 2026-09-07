import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/schedule" element={<p>Расписание</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('гость (401) — редирект на /login', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));

    renderGuarded();

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('сетевой сбой — «Нет связи…» с кнопкой «Повторить», не редирект', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Нет связи', 0, 'network'));

    renderGuarded();

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByText('Экран входа')).not.toBeInTheDocument();
  });

  it('вошедший (любая роль) — рендерит вложенный маршрут', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
    };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });

  it('«Повторить» на офлайне вызывает /auth/me снова', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Нет связи', 0, 'network'));
    const me: MeDto = { id: 'u1', name: 'Дима', roles: ['admin'], tz: 'Asia/Jerusalem' };
    mockedApiFetch.mockResolvedValueOnce(me);

    const user = userEvent.setup();
    renderGuarded();
    await user.click(await screen.findByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });
});
