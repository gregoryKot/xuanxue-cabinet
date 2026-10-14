// Страница `/logout`: открытие ничего не меняет, выход делает только кнопка.
// Сеть — по пути запроса (mockApiByPath), порядок вызовов не важен.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { AuthProvider } from './AuthProvider';
import LogoutScreen from './LogoutScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const LOGOUT_ERROR = 'Не удалось выйти. Попробуйте ещё раз.';

function logoutCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/logout');
}

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/logout']}>
      <AuthProvider>
        <Routes>
          <Route path="/logout" element={<LogoutScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LogoutScreen', () => {
  it('открытие страницы выход не вызывает: заголовок и кнопка, вкладка названа «Выход»', async () => {
    mockApiByPath({ '/auth/me': new ApiError('Войдите', 401, 'unauthorized') });
    renderScreen();

    expect(screen.getByRole('heading', { name: 'Выход' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(document.title).toBe('Выход — Сюань-Сюэ');
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
    );
    expect(logoutCalls()).toHaveLength(0);
  });

  it('нажатие — один POST /auth/logout, затем экран входа', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': new ApiError('Войдите', 401, 'unauthorized'),
      '/auth/logout': undefined,
    });
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
    expect(logoutCalls()).toHaveLength(1);
    expect(logoutCalls()[0]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('сбой — текст ошибки, кнопка остаётся; повторное нажатие повторяет запрос', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': new ApiError('Войдите', 401, 'unauthorized'),
      '/auth/logout': new Error('сеть недоступна'),
    });
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LOGOUT_ERROR);

    mockApiByPath({
      '/auth/me': new ApiError('Войдите', 401, 'unauthorized'),
      '/auth/logout': undefined,
    });
    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
    expect(logoutCalls()).toHaveLength(2);
  });
});
