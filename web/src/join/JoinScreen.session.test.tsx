// Отдельный файл — JoinScreen.test.tsx (211 строк) уже на потолке
// файла-храповика, новый тест — сюда (CLAUDE.md «Храповики»). Про то, что
// делает JoinScreen, когда сессия уже есть (или только что появилась) —
// перенесённый тест ADR-0034 плюс правки по ревью PR #150: blocked тоже
// уходит редиректом, а лишние запросы до редиректа не уходят
// (useJoinByInvite/useAuthConfig включены только при authStatus === 'guest').
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import JoinScreen from './JoinScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const CODE = 'a'.repeat(32);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={[`/join/${CODE}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/join/:code" element={<JoinScreen />} />
          <Route path="/schedule" element={<p>Расписание</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const ACTIVE_ME: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
};

describe('JoinScreen — сессия уже есть (ADR-0034: вход уже создал/подтвердил человека)', () => {
  it('authStatus ok — сразу редирект на /schedule, без /auth/join, /auth/join/check и /auth/config (ревью PR #150)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ACTIVE_ME);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/join', expect.anything());
    // enabled = authStatus === 'guest' (ревью PR #150) — ok никогда им не
    // становится, оба хука не должны были дёрнуть сеть вовсе.
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/join/check',
      expect.anything(),
    );
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/config');
  });

  // Задача 3: заблокированный (сессия жива, /auth/me отвечает 403) тоже
  // уходит с этого экрана — код ссылки ему уже не поможет, а RequireAuth на
  // /schedule покажет ACCESS_MESSAGE вместо того, чтобы он тут увидел форму
  // входа заново.
  it('authStatus blocked — тоже редирект на /schedule, без /auth/join/check и /auth/config', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(
          new ApiError(
            'Доступа нет. Обратитесь к администратору школы.',
            403,
            'forbidden',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/join/check',
      expect.anything(),
    );
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/config');
  });
});
