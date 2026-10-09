import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { RequireDevErrorsAccess } from './RequireDevErrorsAccess';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: [],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    noTelegram: false,
    hasEmail: true,
    needsProfile: false,
    googleLinked: false,
    studentMode: false,
    canUseStudentMode: false,
    homeHiddenTiles: [],
    ...overrides,
  };
}

// Вложено под RequireAuth, как в App.tsx (тот же приём, что у
// RequirePeopleAccess.test.tsx, ревью п.1): без обёртки `me` в первом
// рендере ещё `null`, и тест ловил бы гонку, а не настоящее поведение.
function renderGuarded() {
  return render(
    <MemoryRouter initialEntries={['/dev/errors']}>
      <AuthProvider>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/planning" element={<p>Занятия</p>} />
            <Route element={<RequireDevErrorsAccess />}>
              <Route path="/dev/errors" element={<p>Сбои</p>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireDevErrorsAccess', () => {
  it('учитель — редирект на /planning', async () => {
    mockedApiFetch.mockResolvedValue(makeMe({ roles: ['teacher'] }));

    renderGuarded();

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  it('помощник учителя — редирект на /planning', async () => {
    mockedApiFetch.mockResolvedValue(makeMe({ roles: ['assistant'] }));

    renderGuarded();

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  it('ученик без роли — редирект на /planning', async () => {
    mockedApiFetch.mockResolvedValue(makeMe({ roles: [] }));

    renderGuarded();

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  it('admin — рендерит вложенный маршрут', async () => {
    mockedApiFetch.mockResolvedValue(makeMe({ roles: ['admin'] }));

    renderGuarded();

    expect(await screen.findByText('Сбои')).toBeInTheDocument();
  });
});
