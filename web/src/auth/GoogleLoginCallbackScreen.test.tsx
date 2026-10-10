// Страница возврата из Google (`/login/google?code=…&state=…`, ADR-0145) —
// POST /auth/google уходит сам, из JS, ровно один раз (useCallbackLogin.ts,
// тот же механизм, что у EmailLoginCallbackScreen.test.tsx).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { mockApiByPath } from '../test-support/apiFetchMock';
import { AuthProvider, useAuth } from './AuthProvider';
import GoogleLoginCallbackScreen from './GoogleLoginCallbackScreen';
import { peekNativeAttempt, saveNativeAttempt } from './nativeAttempt';
import { saveReturnTo } from './returnTo';
import type * as TelegramRedirectModule from './telegramAuthRedirect';
import { redirectCurrentTab } from './telegramAuthRedirect';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

// Уход вкладки в Daychi (ADR-0181) — настоящий window.location.assign увёл
// бы jsdom со страницы.
vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectCurrentTab: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const redirectSpy = vi.mocked(redirectCurrentTab);
// Формат из shared/src/google-login.ts: state 43 знака base64url, code —
// печатные ASCII-знаки без пробелов, 10..512.
const VALID_STATE = 'a'.repeat(43);
const VALID_CODE = 'b'.repeat(20);
const NATIVE_ATTEMPT_ID = '0123456789abcdef01234567';

const ME: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
  googleLinked: false,
  studentMode: false,
  canUseStudentMode: false,
  homeHiddenTiles: [],
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

function mockGuestAndGoogleSuccess() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me')
      return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    if (path === '/auth/google') return Promise.resolve(undefined);
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

function googleCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/google');
}

afterEach(() => {
  mockedApiFetch.mockReset();
  redirectSpy.mockClear();
  sessionStorage.clear();
});

function NativeLoginProbe() {
  return <p>Вход в Daychi {useLocation().search}</p>;
}

/** Статус сессии рядом с экраном: проверить, что тупик не всплыл и после
 * ответа /auth/me, а не только до него. */
function AuthStatusProbe() {
  return <span data-testid="auth-status">{useAuth().status}</span>;
}

function renderScreen(search: string, wrapper?: typeof StrictMode) {
  return render(
    <MemoryRouter initialEntries={[`/login/google${search}`]}>
      <AuthProvider>
        <AuthStatusProbe />
        <Routes>
          <Route path="/login/google" element={<GoogleLoginCallbackScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route path="/" element={<p>Занятия</p>} />
          <Route path="/exams" element={<p>Экзамены</p>} />
          <Route path="/profile" element={<p>Профиль</p>} />
          <Route path="/login/native" element={<NativeLoginProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

describe('GoogleLoginCallbackScreen — отменённый вход (POST не уходит вовсе)', () => {
  it('?error=access_denied — «Вход не завершён», кнопка ведёт на /login', async () => {
    const user = userEvent.setup();
    mockMe('guest');
    renderScreen('?error=access_denied');

    expect(await screen.findByText('Вход не завершён')).toBeInTheDocument();
    expect(
      screen.getByText('Вы вернулись из Google, не выбрав аккаунт. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
    expect(googleCalls()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  // ADR-0181: отмена у провайдера при входе из Daychi — сразу continue с
  // отменой, Daychi получает access_denied; тупика нет.
  it('во вкладке попытка Daychi — один переход на continue с отменой, ключ снят', async () => {
    saveNativeAttempt(NATIVE_ATTEMPT_ID);
    mockMe('guest');
    renderScreen('?error=access_denied', StrictMode);

    expect(await screen.findByRole('status')).toHaveTextContent('Открываем Daychi');
    await waitFor(() =>
      expect(screen.getByTestId('auth-status')).toHaveTextContent('guest'),
    );
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith(
      `/api/auth/native/continue?attempt=${NATIVE_ATTEMPT_ID}&cancel=1`,
    );
    expect(peekNativeAttempt()).toBeNull();
    expect(screen.queryByText('Вход не завершён')).not.toBeInTheDocument();
    expect(googleCalls()).toHaveLength(0);
  });
});

describe('GoogleLoginCallbackScreen — битая ссылка (POST не уходит вовсе)', () => {
  it('нет code/state — «Ссылка не подошла»', async () => {
    mockMe('guest');
    renderScreen('');

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(googleCalls()).toHaveLength(0);
  });

  it('state не по формату (не 43 base64url) — «Ссылка не подошла», POST не уходит', async () => {
    mockMe('guest');
    renderScreen(`?code=${VALID_CODE}&state=коротко`);

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(googleCalls()).toHaveLength(0);
  });
});

describe('GoogleLoginCallbackScreen — валидные code/state, вход сам', () => {
  it('пока идёт запрос — заголовок «Входим в кабинет» и скелетон', async () => {
    let resolveGoogle: () => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/google')
        return new Promise<void>((resolve) => {
          resolveGoogle = resolve;
        });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    const { container } = renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(await screen.findByText('Входим в кабинет')).toBeInTheDocument();
    await waitFor(() => expect(googleCalls()).toHaveLength(1));
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);

    resolveGoogle();
    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
  });

  it('гость, нет returnTo — POST /auth/google уходит один раз с {code, state}; после успеха переход на домашний экран', async () => {
    mockGuestAndGoogleSuccess();
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());

    expect(googleCalls()).toHaveLength(1);
    expect(googleCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: { code: VALID_CODE, state: VALID_STATE },
      }),
    );
  });

  it('гость, сохранён returnTo /exams — переход туда', async () => {
    saveReturnTo('/exams');
    mockGuestAndGoogleSuccess();
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    await waitFor(() => expect(screen.getByText('Экзамены')).toBeInTheDocument());
  });

  it('гость, во вкладке попытка Daychi (ADR-0181) — назад на её экран', async () => {
    saveNativeAttempt(NATIVE_ATTEMPT_ID);
    mockGuestAndGoogleSuccess();
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(`Вход в Daychi ?attempt=${NATIVE_ATTEMPT_ID}`),
    ).toBeInTheDocument();
  });

  it('401 от сервера — текст с сервера, кнопка «На страницу входа»', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/google')
        return Promise.reject(
          new ApiError(
            'Не получилось войти через Google. Нажмите «Войти через Google» ещё раз.',
            401,
            'unauthorized',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Не получилось войти через Google. Нажмите «Войти через Google» ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(googleCalls()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    await waitFor(() => expect(screen.getByText('Экран входа')).toBeInTheDocument());
    expect(googleCalls()).toHaveLength(1);
  });

  it('401 от сервера, во вкладке попытка Daychi — кнопка ведёт на её экран, без отмены', async () => {
    const user = userEvent.setup();
    saveNativeAttempt(NATIVE_ATTEMPT_ID);
    mockApiByPath({
      '/auth/me': new ApiError('Войдите', 401, 'unauthorized'),
      '/auth/google': new ApiError(
        'Не получилось войти через Google.',
        401,
        'unauthorized',
      ),
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText('Не получилось войти через Google.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));

    expect(
      await screen.findByText(`Вход в Daychi ?attempt=${NATIVE_ATTEMPT_ID}`),
    ).toBeInTheDocument();
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('409 (адрес уже привязан к почте) — текст с сервера, кнопка «На страницу входа»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/google')
        return Promise.reject(
          new ApiError(
            'Этот адрес почты уже есть в кабинете. Войдите по почте, как раньше.',
            409,
            'conflict',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Этот адрес почты уже есть в кабинете. Войдите по почте, как раньше.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'На страницу входа' })).toBeInTheDocument();
  });

  it('403 без ссылки-приглашения — текст сервера, приписка вместо кнопки', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/google')
        return Promise.reject(
          new ApiError(
            'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
            403,
            'forbidden',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('учитель школы').tagName).toBe('STRONG');
    expect(
      screen.queryByRole('button', { name: 'На страницу входа' }),
    ).not.toBeInTheDocument();
  });

  it('503 (Google не подключён) — текст сервера, кнопка «На страницу входа»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/google')
        return Promise.reject(
          new ApiError(
            'Вход через Google пока не подключён. Войдите через Telegram или по почте.',
            503,
            'not_available',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Вход через Google пока не подключён. Войдите через Telegram или по почте.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'На страницу входа' })).toBeInTheDocument();
  });

  it('сетевой сбой (не ApiError) — общий текст, кнопка «На страницу входа»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/google') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'На страницу входа' })).toBeInTheDocument();
  });
});

// Привязка Google (ADR-0145): человек открывает эту же страницу уже
// вошедшим (GoogleLinkSection.tsx → redirectToGoogleLink → сервер по своей
// cookie состояния понимает «это привязка», вернувшись, POST уходит как
// обычно — сервер сам решит, вход это или привязка. Раньше сессия сразу
// уводила Navigate-ом, не звоня серверу вовсе — это и был баг, который эта
// привязка чинит.
describe('GoogleLoginCallbackScreen — сессия уже есть (привязка), POST уходит как обычно', () => {
  it('успех — POST уходит с {code, state}, после успеха переход на сохранённый returnTo (/profile)', async () => {
    saveReturnTo('/profile');
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/google') return Promise.resolve({ ...ME, googleLinked: true });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    await waitFor(() => expect(screen.getByText('Профиль')).toBeInTheDocument());

    expect(googleCalls()).toHaveLength(1);
    expect(googleCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: { code: VALID_CODE, state: VALID_STATE },
      }),
    );
  });

  it('успех, нет сохранённого returnTo — переход на домашний экран', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/google') return Promise.resolve({ ...ME, googleLinked: true });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
    expect(googleCalls()).toHaveLength(1);
  });

  it('409 (Google уже привязан к другому аккаунту) — текст сервера, кнопка «Вернуться» ведёт в /profile', async () => {
    const user = userEvent.setup();
    saveReturnTo('/profile');
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/google')
        return Promise.reject(
          new ApiError(
            'Этот Google уже привязан к другому аккаунту кабинета. Напишите учителю школы.',
            409,
            'conflict',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Этот Google уже привязан к другому аккаунту кабинета. Напишите учителю школы.',
      ),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Вернуться' });
    expect(
      screen.queryByRole('button', { name: 'На страницу входа' }),
    ).not.toBeInTheDocument();

    await user.click(button);
    await waitFor(() => expect(screen.getByText('Профиль')).toBeInTheDocument());
  });

  it('401 (сессия закончилась между началом и возвратом) — текст сервера, кнопка «Вернуться»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/google')
        return Promise.reject(
          new ApiError(
            'Сессия закончилась. Войдите и нажмите «Привязать Google» ещё раз.',
            401,
            'unauthorized',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(
      await screen.findByText(
        'Сессия закончилась. Войдите и нажмите «Привязать Google» ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вернуться' })).toBeInTheDocument();
  });

  it('отменённый выбор аккаунта во время привязки — «Вход не завершён», кнопка «Вернуться», POST не уходит', async () => {
    const user = userEvent.setup();
    saveReturnTo('/profile');
    mockMe('ok');
    renderScreen('?error=access_denied');

    expect(await screen.findByText('Вход не завершён')).toBeInTheDocument();
    expect(googleCalls()).toHaveLength(0);
    const button = screen.getByRole('button', { name: 'Вернуться' });

    await user.click(button);
    await waitFor(() => expect(screen.getByText('Профиль')).toBeInTheDocument());
  });

  it('пока /auth/me ещё не ответил — POST ждёт; как только сессия выяснена (есть), уходит', async () => {
    let resolveFirstMe: (me: MeDto) => void = () => {};
    let meCallCount = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') {
        meCallCount += 1;
        // Только первый вызов управляется тестом (проверка сессии при
        // монтировании) — refresh() после успешного POST зовёт /auth/me ещё
        // раз, и этот повторный вызов не должен виснуть навечно (тот же
        // приём, что EmailLoginCallbackScreen.test.tsx).
        if (meCallCount === 1) {
          return new Promise((resolve) => {
            resolveFirstMe = resolve;
          });
        }
        return Promise.resolve(ME);
      }
      if (path === '/auth/google') return Promise.resolve({ ...ME, googleLinked: true });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?code=${VALID_CODE}&state=${VALID_STATE}`);

    expect(await screen.findByText('Входим в кабинет')).toBeInTheDocument();
    expect(googleCalls()).toHaveLength(0);

    resolveFirstMe(ME);

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
    expect(googleCalls()).toHaveLength(1);
  });
});
