// Клик по кнопке теперь не ждёт ничего в этой вкладке — он сразу уводит
// браузер на Telegram (redirectToTelegramAuth), поэтому в тестах эта функция
// замокана: настоящий window.location.assign увёл бы jsdom со страницы.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto, TelegramLoginInput } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import LoginScreen from './LoginScreen';
import type * as TelegramAuthRedirectModule from './telegramAuthRedirect';
import { redirectToTelegramAuth } from './telegramAuthRedirect';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

// Настоящий redirectToTelegramAuth зовёт window.location.assign — в jsdom
// это увело бы страницу и оборвало тест, поэтому подменяем именно его,
// оставляя telegramAuthUrl настоящим (им пользуется telegramAuthRedirect.test.ts).
vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramAuthRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectToTelegramAuth: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const redirectToTelegramAuthSpy = vi.mocked(redirectToTelegramAuth);

function mockRoutes(config: () => Promise<unknown>) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/config') return config();
    if (path === '/auth/me')
      return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

/** Тот же способ, что у telegram-widget.js: JSON → base64 → base64url без
 * паддинга (см. telegramAuthResult.test.ts). */
function toTgAuthResultHash(user: TelegramLoginInput): string {
  // first_name часто кириллица («Дима») — голый btoa(JSON.stringify(...))
  // падает на не-Latin1 символах, поэтому кодируем в сырые UTF-8-байты, как
  // это делает сервер Telegram (см. telegramAuthResult.test.ts).
  const bytes = new TextEncoder().encode(JSON.stringify(user));
  const binaryString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const encoded = btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#tgAuthResult=${encoded}`;
}

afterEach(() => {
  mockedApiFetch.mockReset();
  redirectToTelegramAuthSpy.mockClear();
  window.location.hash = ''; // мобильный сценарий оставляет фрагмент — чистим между тестами
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/schedule" element={<p>Расписание</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginScreen — конфигурация', () => {
  it('без бота — «не настроен»', async () => {
    mockRoutes(() => Promise.resolve({}));
    renderScreen();
    expect(
      await screen.findByText(
        'Вход через Telegram не настроен. Напишите администратору школы.',
      ),
    ).toBeInTheDocument();
  });

  it('сетевой сбой — «Нет связи…» с кнопкой «Повторить», не «не настроен»', async () => {
    mockRoutes(() => Promise.reject(new Error('сеть недоступна')));
    renderScreen();
    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
    expect(screen.queryByText(/не настроен/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  // «Повторить» после сетевого сбоя обязана перезапросить конфигурацию:
  // иначе кнопка есть, а нажатие ничего не делает — тот же тихий отказ.
  it('«Повторить» после сбоя перезапрашивает конфигурацию и показывает кнопку входа', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mockRoutes(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('сеть недоступна'))
        : Promise.resolve({ telegramBotId: 123456 });
    });
    renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Повторить' }));

    expect(
      await screen.findByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
  });

  it('с ботом — кнопка «Войти через Telegram»', async () => {
    mockRoutes(() => Promise.resolve({ telegramBotId: 123456 }));
    renderScreen();
    expect(
      await screen.findByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
  });
});

describe('LoginScreen — вход', () => {
  it('клик уводит вкладку на Telegram с botId и оставляет кнопку занятой', async () => {
    const user = userEvent.setup();
    mockRoutes(() => Promise.resolve({ telegramBotId: 123456 }));
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Войти через Telegram' });
    await user.click(button);

    expect(redirectToTelegramAuthSpy).toHaveBeenCalledWith(123456);
    expect(redirectToTelegramAuthSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeDisabled());
    // Никакого запроса в этой вкладке: результат придёт фрагментом адреса
    // на возврате (useTelegramAuthResultLogin), а не отсюда.
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/telegram', expect.anything());
  });
});

describe('LoginScreen — мобильный вход через #tgAuthResult= (баг с прода 2026-09-08)', () => {
  it('фрагмент в адресе → POST /auth/telegram сам, refresh, редирект на /schedule, фрагмент убран', async () => {
    const fakeTelegramUser: TelegramLoginInput = {
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    };
    window.location.hash = toTgAuthResultHash(fakeTelegramUser);

    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
      status: 'active',
    };
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({ telegramBotId: 123456 });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram') return Promise.resolve(me);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/telegram',
      expect.objectContaining({ method: 'POST', body: fakeTelegramUser }),
    );
    expect(window.location.hash).toBe('');
  });

  it('фрагмент в адресе, но POST падает — текст ошибки виден, на /schedule не уводит', async () => {
    window.location.hash = toTgAuthResultHash({
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    });

    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({ telegramBotId: 123456 });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram')
        return Promise.reject(
          new ApiError('Подпись виджета не сошлась.', 401, 'unauthorized'),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Подпись виджета не сошлась.')).toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();
  });

  it('фрагмент в адресе, POST падает не ApiError — общий текст ошибки', async () => {
    window.location.hash = toTgAuthResultHash({
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    });

    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({ telegramBotId: 123456 });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(
      await screen.findByText('Не удалось войти. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();
  });
});

describe('LoginScreen — уже вошедшего уводит на /schedule', () => {
  it('authStatus ok — редирект, форма не показывается', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Дима',
          roles: ['teacher'],
          tz: 'Asia/Jerusalem',
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет школы Сюань-Сюэ')).not.toBeInTheDocument();
  });
});
