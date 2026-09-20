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
import { saveReturnTo } from './returnTo';
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
  sessionStorage.clear();
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/schedule" element={<p>Расписание</p>} />
          <Route path="/" element={<p>Занятия</p>} />
          <Route path="/exams" element={<p>Экзамены</p>} />
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
    expect(
      screen.getByText('Откроется Telegram в этой же вкладке и вернёт вас обратно.'),
    ).toBeInTheDocument();
  });

  // Отзыв владельца (ADR-0044) — приписка стоит НАД кнопкой входа и видна
  // всегда, даже без Telegram и без почты: новый человек без
  // ссылки-приглашения (ADR-0030) должен узнать об этом ДО того, как уйдёт в
  // Telegram и получит красным 403 (CLAUDE.md «откуда это и зачем» до
  // первого действия), а не только когда ни один способ входа не настроен.
  it('приписка про ссылку-приглашение видна независимо от способов входа, ещё до кнопки Telegram', async () => {
    mockRoutes(() => Promise.resolve({}));
    renderScreen();
    expect(
      await screen.findByText('Первый вход — только по ссылке от учителя.'),
    ).toBeInTheDocument();
  });

  it('приписка стоит в разметке раньше кнопки Telegram — «до первого действия», не после', async () => {
    mockRoutes(() => Promise.resolve({ telegramBotId: 123456 }));
    const { container } = renderScreen();

    await screen.findByRole('button', { name: 'Войти через Telegram' });

    const text = container.textContent ?? '';
    const invitePosition = text.indexOf('Первый вход —');
    const buttonPosition = text.indexOf('Войти через Telegram');

    expect(invitePosition).toBeGreaterThanOrEqual(0);
    expect(invitePosition).toBeLessThan(buttonPosition);
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
  it('фрагмент в адресе → POST /auth/telegram сам, refresh, редирект на домашний экран (нет returnTo), фрагмент убран', async () => {
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
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({ telegramBotId: 123456 });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram') return Promise.resolve(me);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/telegram',
      expect.objectContaining({ method: 'POST', body: fakeTelegramUser }),
    );
    expect(window.location.hash).toBe('');
  });

  // Отзыв владельца (ADR-0044) — приписка про ссылку-приглашение раньше
  // жила внутри children TelegramLoginSection и пряталась вместе с формой
  // почты на время авто-входа по фрагменту; теперь стоит above блока входа
  // и не должна исчезать, пока идёт автоматическая проверка фрагмента.
  it('приписка про ссылку-приглашение видна и во время авто-входа по фрагменту (не прячется вместе с формой почты)', async () => {
    window.location.hash = toTgAuthResultHash({
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    });
    let resolveTelegramLogin: (me: MeDto) => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({ telegramBotId: 123456 });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram')
        return new Promise<MeDto>((resolve) => {
          resolveTelegramLogin = resolve;
        });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(
      await screen.findByText('Первый вход — только по ссылке от учителя.'),
    ).toBeInTheDocument();

    resolveTelegramLogin({
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    });
    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
  });

  it('фрагмент в адресе, сохранён returnTo /exams (аудит L2) — редирект туда, не на домашний', async () => {
    saveReturnTo('/exams');
    window.location.hash = toTgAuthResultHash({
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    });

    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({ telegramBotId: 123456 });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram') return Promise.resolve(me);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });

    renderScreen();

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
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

    // Обычная ошибка входа (кривая подпись, не 403) — красным, как раньше
    // (ADR-0044 меняет только 403/блокировку, TelegramLoginSection.tsx).
    const alert = await screen.findByText('Подпись виджета не сошлась.');
    expect(alert.style.color).toBe('var(--danger)');
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();
  });

  // ADR-0030/0036: без ссылки-приглашения новый человек в кабинет не
  // попадает — 403 с текстом сервера, который уже называет действие
  // (открыть ссылку), а не просто «доступа нет».
  //
  // Регрессия на отзыв владельца 2026-09-18: «если человек без ссылки заходит
  // через телегу, просто возвращает на страницу логина». Объяснение стояло
  // строкой под живой кнопкой «Войти» и терялось — теперь оно занимает место
  // самой формы, поэтому тест проверяет не цвет строки, а исчезнувший вход.
  function mockRefusedTelegramLogin(): void {
    window.location.hash = toTgAuthResultHash({
      id: 700,
      first_name: 'Незнакомец',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    });

    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: true });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/telegram')
        return Promise.reject(
          new ApiError(
            'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
            403,
            'forbidden',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
  }

  it('фрагмент в адресе, POST падает 403 (нет ссылки-приглашения) — объяснение вместо формы входа', async () => {
    mockRefusedTelegramLogin();

    renderScreen();

    const alert = await screen.findByText(
      'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
    );
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.getByText('Войти не получилось')).toBeInTheDocument();
    // Ни кнопки Telegram, ни почты: оба пути упрутся в тот же 403
    // (LoginIdentityService — одно правило на оба).
    expect(
      screen.queryByRole('button', { name: 'Войти через Telegram' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();
  });

  it('«Войти другим способом» на отказе 403 возвращает форму входа — вошёл не тем аккаунтом', async () => {
    mockRefusedTelegramLogin();

    renderScreen();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Войти другим способом' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Войти не получилось')).not.toBeInTheDocument();
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

describe('LoginScreen — блок email (emailLoginEnabled)', () => {
  it('emailLoginEnabled: false — блока «Войдите по почте» нет, приписка про ссылку-приглашение всё равно видна', async () => {
    mockRoutes(() =>
      Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: false }),
    );
    renderScreen();

    await screen.findByRole('button', { name: 'Войти через Telegram' });
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
    // Приписка не была частью блока почты и раньше пряталась вместе с ним
    // (ADR-0044) — теперь она не зависит от emailLoginEnabled вовсе.
    expect(
      screen.getByText('Первый вход — только по ссылке от учителя.'),
    ).toBeInTheDocument();
  });

  it('emailLoginEnabled: true — форма есть, отправка → «Письмо ушло»', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: true });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/request') return Promise.resolve(undefined);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать ссылку для входа' }));

    expect(await screen.findByText(/Письмо ушло на a@example\.com/)).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
  });

  it('сетевой сбой при запросе ссылки — «Нет связи…» под полем', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotId: 123456, emailLoginEnabled: true });
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/request') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать ссылку для входа' }));

    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
  });
});

describe('LoginScreen — уже вошедшего уводит на сохранённый адрес или домашний (аудит L2)', () => {
  function mockAlreadyLoggedIn() {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me')
        return Promise.resolve({
          id: 'u1',
          name: 'Дима',
          roles: ['teacher'],
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
  }

  it('authStatus ok, нет returnTo — редирект на домашний экран, форма не показывается', async () => {
    mockAlreadyLoggedIn();

    renderScreen();

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет школы')).not.toBeInTheDocument();
  });

  it('authStatus ok, есть returnTo /exams — редирект туда, не на домашний', async () => {
    saveReturnTo('/exams');
    mockAlreadyLoggedIn();

    renderScreen();

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
  });
});
