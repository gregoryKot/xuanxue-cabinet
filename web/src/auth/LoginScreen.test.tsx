// LoginScreen сам не грузит виджет (jsdom не исполняет удалённые скрипты) —
// script и window.Telegram.Login.auth подставляются вручную, как в
// useTelegramLogin.test.ts.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto, TelegramLoginInput } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import LoginScreen from './LoginScreen';
import { __resetTelegramWidgetForTests } from './useTelegramLogin';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function mockRoutes(
  config: () => Promise<unknown>,
  telegramLogin: () => Promise<MeDto> = () => Promise.reject(new Error('не ожидался')),
) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/config') return config();
    if (path === '/auth/me')
      return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    if (path === '/auth/telegram') return telegramLogin();
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

/** window.Telegram фейк с типизированным callback — без него vi.fn(...)
 * выводит параметры как `any` (eslint no-unsafe-call/no-unsafe-return). */
function stubTelegramWidget(user: TelegramLoginInput) {
  const auth = vi.fn((_options: unknown, callback: (u: TelegramLoginInput) => void) => {
    callback(user);
  });
  window.Telegram = { Login: { auth } };
}

/** Скрипт виджета вставляет useEffect — он выполняется после коммита, а
 * findByRole резолвится по мутации DOM раньше него: без ожидания под
 * нагрузкой CI `load` уходил в пустоту и кнопка оставалась выключенной. */
async function fireScriptLoad() {
  const script = await waitFor(() => {
    const found = document.head.querySelector('script[src*="telegram-widget"]');
    expect(found).not.toBeNull();
    return found;
  });
  script?.dispatchEvent(new Event('load'));
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
  __resetTelegramWidgetForTests();
  delete window.Telegram;
  document.head.innerHTML = '';
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

  it('с ботом — кнопка «Войти через Telegram»', async () => {
    mockRoutes(() => Promise.resolve({ telegramBotId: 123456 }));
    renderScreen();
    expect(
      await screen.findByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
  });
});

describe('LoginScreen — вход', () => {
  it('успешный вход: клик → auth() → POST /auth/telegram → редирект на /schedule', async () => {
    const user = userEvent.setup();
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
    };
    mockRoutes(
      () => Promise.resolve({ telegramBotId: 123456 }),
      () => Promise.resolve(me),
    );
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Войти через Telegram' });
    await fireScriptLoad();
    await waitFor(() => expect(button).not.toBeDisabled());

    const fakeTelegramUser: TelegramLoginInput = {
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    };
    stubTelegramWidget(fakeTelegramUser);

    await user.click(button);

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/telegram',
      expect.objectContaining({ method: 'POST', body: fakeTelegramUser }),
    );
  });

  it('ошибка входа (ApiError) — текст ошибки, без редиректа', async () => {
    const user = userEvent.setup();
    mockRoutes(
      () => Promise.resolve({ telegramBotId: 123456 }),
      () =>
        Promise.reject(new ApiError('Подпись виджета не сошлась.', 401, 'unauthorized')),
    );
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Войти через Telegram' });
    await fireScriptLoad();
    await waitFor(() => expect(button).not.toBeDisabled());

    stubTelegramWidget({ id: 1, first_name: 'X', auth_date: 1, hash: 'a'.repeat(64) });
    await user.click(button);

    expect(await screen.findByText('Подпись виджета не сошлась.')).toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();
  });

  it('попап закрыт без входа (callback(false)) — тихо, без текста ошибки', async () => {
    const user = userEvent.setup();
    mockRoutes(() => Promise.resolve({ telegramBotId: 123456 }));
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Войти через Telegram' });
    await fireScriptLoad();
    await waitFor(() => expect(button).not.toBeDisabled());
    window.Telegram = {
      Login: {
        auth: vi.fn((_options: unknown, callback: (u: false) => void) => callback(false)),
      },
    };

    await user.click(button);

    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/telegram', expect.anything());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('неизвестная ошибка (не ApiError) — общий текст', async () => {
    const user = userEvent.setup();
    mockRoutes(
      () => Promise.resolve({ telegramBotId: 123456 }),
      () => Promise.reject(new Error('boom')),
    );
    renderScreen();

    const button = await screen.findByRole('button', { name: 'Войти через Telegram' });
    await fireScriptLoad();
    await waitFor(() => expect(button).not.toBeDisabled());
    stubTelegramWidget({ id: 1, first_name: 'X', auth_date: 1, hash: 'a'.repeat(64) });

    await user.click(button);

    expect(
      await screen.findByText('Не удалось войти. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
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
    };
    mockRoutes(
      () => Promise.resolve({ telegramBotId: 123456 }),
      () => Promise.resolve(me),
    );

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

    mockRoutes(
      () => Promise.resolve({ telegramBotId: 123456 }),
      () =>
        Promise.reject(new ApiError('Подпись виджета не сошлась.', 401, 'unauthorized')),
    );

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

    mockRoutes(
      () => Promise.resolve({ telegramBotId: 123456 }),
      () => Promise.reject(new Error('boom')),
    );

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
