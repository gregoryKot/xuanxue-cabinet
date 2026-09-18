// Отдельный файл — EmailLoginCallbackScreen.test.tsx уже на потолке
// файла-храповика, новый тест — сюда (CLAUDE.md «Храповики»). Заблокированный
// (сессия жива, /auth/me отвечает 403) уходит с этого экрана сам, а не
// остаётся ждать ответ verify — там его снова ждал бы тот же отказ (ревью PR
// #150, hasSession в EmailLoginCallbackScreen.tsx вместо authStatus === 'ok'),
// и verify (ADR-0044) не отправляется вовсе — сессия уже есть.
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
  it('authStatus blocked — уходит на домашний маршрут кабинета, verify не отправлен', async () => {
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
    expect(screen.queryByText('Входим в кабинет')).not.toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.anything(),
    );
  });
});
