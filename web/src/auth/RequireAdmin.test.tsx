import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { RequireAdmin } from './RequireAdmin';
import { RequireAuth } from './RequireAuth';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

// Вложено под RequireAuth, как в App.tsx (RequireAdmin сам не ждёт загрузку
// сессии — он всегда стоит внутри уже подтверждённой RequireAuth, ревью п.1):
// без этой обёртки `me` в первом рендере ещё `null`, и тест ловил бы гонку,
// а не настоящее поведение маршрута.
function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/people']}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/planning" element={<p>Занятия</p>} />
            <Route element={<RequireAdmin />}>
              <Route path="/people" element={<p>Люди</p>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAdmin', () => {
  it('учитель без admin — редирект на /planning', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
    };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded();

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  // Без RequireAuth в дереве `me` при первом рендере ещё null — гвард обязан
  // уводить на /planning, а не падать на чтении roles.
  it('без сессии (me = null) — редирект на /planning, без падения', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));
    render(
      <MemoryRouter initialEntries={['/people']}>
        <AuthProvider>
          <Routes>
            <Route path="/planning" element={<p>Занятия</p>} />
            <Route element={<RequireAdmin />}>
              <Route path="/people" element={<p>Люди</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  it('admin — рендерит вложенный маршрут', async () => {
    const me: MeDto = { id: 'u2', name: 'Маша', roles: ['admin'], tz: 'Asia/Jerusalem' };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded();

    expect(await screen.findByText('Люди')).toBeInTheDocument();
  });
});
