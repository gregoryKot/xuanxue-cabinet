// Экран целиком: check → карточка входа/сообщение/авто-присоединение
// (useJoinByInvite.ts уже покрыт отдельно юнитом — здесь смоук по веткам
// рендера и по тому, что EmailLoginForm получает inviteCode).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route path="/schedule" element={<p>Расписание</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('JoinScreen — ссылка не действует', () => {
  it('checkStatus invalid — сообщение и кнопка «На страницу входа» ведёт на /login', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: false });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(
      screen.getByText('Ссылка-приглашение не действует. Попросите у учителя новую.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });
});

describe('JoinScreen — сеть недоступна при проверке', () => {
  it('checkStatus offline — «Нет связи…», «Повторить» перезапрашивает check', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ valid: true });
      }
      if (path === '/auth/config') return Promise.resolve({});
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();
    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() =>
      expect(
        screen.getByText('Вас пригласили в кабинет школы Сюань-Сюэ'),
      ).toBeInTheDocument(),
    );
  });
});

describe('JoinScreen — ссылка действует, гость', () => {
  it('карточка приглашения — кнопка Telegram, форма почты с inviteCode', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: true });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(
      await screen.findByText('Вас пригласили в кабинет школы Сюань-Сюэ'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
  });
});

describe('JoinScreen — сессия уже есть', () => {
  it('authStatus ok — join() сам, переход на /schedule', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Ученик',
          roles: [],
          tz: 'Asia/Jerusalem',
          status: 'invited',
        });
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/join')
        return Promise.resolve({
          id: 'u1',
          name: 'Ученик',
          roles: [],
          tz: 'Asia/Jerusalem',
          status: 'active',
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });

  it('join() падает — текст ошибки и «Повторить», повтор ведёт на /schedule', async () => {
    const user = userEvent.setup();
    let joinAttempt = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Ученик',
          roles: [],
          tz: 'Asia/Jerusalem',
          status: 'invited',
        });
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/join') {
        joinAttempt += 1;
        return joinAttempt === 1
          ? Promise.reject(
              new ApiError('Ссылка-приглашение не действует.', 401, 'unauthorized'),
            )
          : Promise.resolve({
              id: 'u1',
              name: 'Ученик',
              roles: [],
              tz: 'Asia/Jerusalem',
              status: 'active',
            });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(
      await screen.findByText('Ссылка-приглашение не действует.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });
});
