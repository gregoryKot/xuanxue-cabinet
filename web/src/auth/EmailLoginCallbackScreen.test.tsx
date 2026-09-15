// Экран ссылки из письма (`/login/email?token=…`, ADR-0029). Токен тратится
// по нажатию «Войти», не при открытии страницы (SECURITY §2) — тесты ниже
// проверяют, что POST /auth/email/verify не уходит сам при рендере.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
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

const ME: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

function mockMe(result: 'guest' | 'ok' = 'guest') {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') {
      return result === 'ok'
        ? Promise.resolve(ME)
        : Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    }
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/login/email${search}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/login/email" element={<EmailLoginCallbackScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route path="/schedule" element={<p>Расписание</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('EmailLoginCallbackScreen — битая ссылка', () => {
  it('нет токена — «Ссылка неполная», кнопка ведёт на /login', async () => {
    const user = userEvent.setup();
    mockMe('guest');
    renderScreen('');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('токен не 64 hex — «Ссылка неполная», как без токена вовсе', async () => {
    mockMe('guest');
    renderScreen('?token=коротко');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
  });
});

describe('EmailLoginCallbackScreen — валидный токен', () => {
  it('карточка «Подтвердите вход» — verify не уходит до клика', async () => {
    mockMe('guest');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Подтвердите вход')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.anything(),
    );
  });

  it('клик «Войти» — POST /auth/email/verify, refresh, переход на /schedule', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify') return Promise.resolve(ME);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.objectContaining({ method: 'POST', body: { token: VALID_TOKEN } }),
    );
  });

  it('401 от сервера — текст с сервера, кнопка «Запросить новую» ведёт на /login', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify')
        return Promise.reject(
          new ApiError(
            'Ссылка устарела или уже использована. Запросите новую на странице входа.',
            401,
            'unauthorized',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(
      await screen.findByText(
        'Ссылка устарела или уже использована. Запросите новую на странице входа.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Запросить новую' }));
    await waitFor(() => expect(screen.getByText('Экран входа')).toBeInTheDocument());
  });
});

describe('EmailLoginCallbackScreen — уже вошедшего уводит на /schedule', () => {
  it('authStatus ok — редирект, карточка не показывается', async () => {
    mockMe('ok');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(screen.queryByText('Подтвердите вход')).not.toBeInTheDocument();
  });
});
