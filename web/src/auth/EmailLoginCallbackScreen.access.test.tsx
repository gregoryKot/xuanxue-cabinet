// Отдельный файл — EmailLoginCallbackScreen.test.tsx (236 строк) уже на
// потолке файла-храповика, новый тест — сюда (CLAUDE.md «Храповики»).
// Заблокированный (сессия жива, /auth/me отвечает 403) уходит с этого экрана
// сам, а не остаётся жать «Войти» заново — там его снова ждал бы тот же
// отказ (ревью PR #150, hasSession в EmailLoginCallbackScreen.tsx вместо
// authStatus === 'ok').
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import EmailLoginCallbackScreen from './EmailLoginCallbackScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const VALID_TOKEN = 'a'.repeat(64);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={[`/login/email?token=${VALID_TOKEN}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/login/email" element={<EmailLoginCallbackScreen />} />
          <Route path="/" element={<p>Занятия</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('EmailLoginCallbackScreen — заблокированный с сессией (ревью PR #150)', () => {
  it('authStatus blocked — уходит с карточки «Подтвердите вход» на домашний маршрут кабинета', async () => {
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

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(screen.queryByText('Подтвердите вход')).not.toBeInTheDocument();
  });
});
