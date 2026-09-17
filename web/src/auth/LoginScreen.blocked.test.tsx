// Отдельный файл — LoginScreen.test.tsx (383 строки) уже на потолке
// файла-храповика, новый тест — сюда (CLAUDE.md «Храповики»). Заблокированный
// (сессия жива, /auth/me отвечает 403) уходит с формы входа сам, а не сидит
// жать «Войти» заново — там его снова ждал бы тот же отказ (ревью PR #150,
// hasSession в LoginScreen.tsx вместо authStatus === 'ok').
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import LoginScreen from './LoginScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/" element={<p>Занятия</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginScreen — заблокированный с сессией (ревью PR #150)', () => {
  it('authStatus blocked — уходит с экрана входа на домашний маршрут кабинета, форма не показывается', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
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

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет школы')).not.toBeInTheDocument();
  });
});
