// Страница возврата из Telegram (`/login/telegram?code=…&state=…`, ADR-0187) —
// POST /auth/telegram/oidc уходит сам, из JS, ровно один раз. Общее с Google
// (отмена, тупики, кнопки) держит ProviderCallbackScreen.tsx и проверено в
// GoogleLoginCallbackScreen.test.tsx; здесь — то, что знает о себе Telegram:
// ключ запроса, тело, тексты. Сеть — по пути запроса (mockApiByPath), не
// очередью.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TELEGRAM_LOGIN_FAILED_MESSAGE } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { makeMe } from '../test-support/meFixture';
import { AuthProvider, useAuth } from './AuthProvider';
import { peekNativeAttempt, saveNativeAttempt } from './nativeAttempt';
import { saveReturnTo } from './returnTo';
import type * as TelegramRedirectModule from './telegramAuthRedirect';
import { redirectCurrentTab } from './telegramAuthRedirect';
import TelegramLoginCallbackScreen from './TelegramLoginCallbackScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

// Уход вкладки в Daychi (ADR-0181) — настоящий window.location.assign увёл бы
// jsdom со страницы.
vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectCurrentTab: vi.fn() };
});

const redirectSpy = vi.mocked(redirectCurrentTab);
resetApiFetchBetweenTests();

// Формат из shared/src/telegram-oidc.ts: state 43 знака base64url, code —
// печатные ASCII-знаки без пробелов, 10..512.
const VALID_STATE = 'a'.repeat(43);
const VALID_CODE = 'b'.repeat(20);
const VALID_SEARCH = `?code=${VALID_CODE}&state=${VALID_STATE}`;
const NATIVE_ATTEMPT_ID = '0123456789abcdef01234567';
const GUEST = new ApiError('Войдите', 401, 'unauthorized');
const OIDC_PATH = '/auth/telegram/oidc';

afterEach(() => {
  redirectSpy.mockClear();
  sessionStorage.clear();
});

function NativeLoginProbe() {
  return <p>Вход в Daychi {useLocation().search}</p>;
}

/** Статус сессии рядом с экраном: тупик не должен всплыть и после ответа
 * /auth/me, а не только до него. */
function AuthStatusProbe() {
  return <span data-testid="auth-status">{useAuth().status}</span>;
}

function renderScreen(search: string, wrapper?: typeof StrictMode) {
  return render(
    <MemoryRouter initialEntries={[`/login/telegram${search}`]}>
      <AuthProvider>
        <AuthStatusProbe />
        <Routes>
          <Route path="/login/telegram" element={<TelegramLoginCallbackScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route path="/" element={<p>Занятия</p>} />
          <Route path="/exams" element={<p>Экзамены</p>} />
          <Route path="/login/native" element={<NativeLoginProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

function oidcCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === OIDC_PATH);
}

describe('TelegramLoginCallbackScreen — валидные code/state, вход сам', () => {
  it('гость — POST /auth/telegram/oidc уходит один раз с {code, state}, потом домашний экран', async () => {
    mockApiByPath({ '/auth/me': GUEST, [OIDC_PATH]: makeMe() });
    renderScreen(VALID_SEARCH, StrictMode);

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());

    expect(oidcCalls()).toHaveLength(1);
    expect(oidcCalls()[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        body: { code: VALID_CODE, state: VALID_STATE },
      }),
    );
  });

  it('пока идёт запрос — заголовок «Входим в кабинет» и скелетон, POST ещё один', async () => {
    let resolveOidc: (me: unknown) => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === OIDC_PATH) {
        return new Promise((resolve) => {
          resolveOidc = resolve;
        });
      }
      return Promise.reject(GUEST);
    });
    const { container } = renderScreen(VALID_SEARCH);

    expect(await screen.findByText('Входим в кабинет')).toBeInTheDocument();
    await waitFor(() => expect(oidcCalls()).toHaveLength(1));
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);

    resolveOidc(makeMe());
    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
    expect(oidcCalls()).toHaveLength(1);
  });

  it('сохранён returnTo /exams — переход туда', async () => {
    saveReturnTo('/exams');
    mockApiByPath({ '/auth/me': GUEST, [OIDC_PATH]: makeMe() });
    renderScreen(VALID_SEARCH);

    await waitFor(() => expect(screen.getByText('Экзамены')).toBeInTheDocument());
  });

  it('во вкладке попытка Daychi (ADR-0181) — назад на её экран', async () => {
    saveNativeAttempt(NATIVE_ATTEMPT_ID);
    mockApiByPath({ '/auth/me': GUEST, [OIDC_PATH]: makeMe() });
    renderScreen(VALID_SEARCH);

    expect(
      await screen.findByText(`Вход в Daychi ?attempt=${NATIVE_ATTEMPT_ID}`),
    ).toBeInTheDocument();
  });

  it('401 — текст сервера и кнопка «На страницу входа», повторного POST нет', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': GUEST,
      [OIDC_PATH]: new ApiError(TELEGRAM_LOGIN_FAILED_MESSAGE, 401, 'unauthorized'),
    });
    renderScreen(VALID_SEARCH);

    expect(await screen.findByText(TELEGRAM_LOGIN_FAILED_MESSAGE)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    await waitFor(() => expect(screen.getByText('Экран входа')).toBeInTheDocument());
    expect(oidcCalls()).toHaveLength(1);
  });

  it('403 без ссылки-приглашения — текст сервера, приписка вместо кнопки', async () => {
    mockApiByPath({
      '/auth/me': GUEST,
      [OIDC_PATH]: new ApiError(
        'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
        403,
        'forbidden',
      ),
    });
    renderScreen(VALID_SEARCH);

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

  it('сетевой сбой (не ApiError) — общий текст, кнопка «На страницу входа»', async () => {
    mockApiByPath({ '/auth/me': GUEST, [OIDC_PATH]: new Error('boom') });
    renderScreen(VALID_SEARCH);

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'На страницу входа' })).toBeInTheDocument();
  });
});

describe('TelegramLoginCallbackScreen — отказ у Telegram (POST не уходит вовсе)', () => {
  it('?error=access_denied — «Вход не завершён», кнопка ведёт на /login', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/auth/me': GUEST });
    renderScreen('?error=access_denied');

    expect(await screen.findByText('Вход не завершён')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Вы вернулись из Telegram, не подтвердив вход. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(oidcCalls()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('?error рядом с валидными code/state — отказ важнее, POST не уходит', async () => {
    mockApiByPath({ '/auth/me': GUEST });
    renderScreen(`${VALID_SEARCH}&error=access_denied`);

    expect(await screen.findByText('Вход не завершён')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('auth-status')).toHaveTextContent('guest'),
    );
    expect(oidcCalls()).toHaveLength(0);
  });

  it('во вкладке попытка Daychi — один переход на continue с отменой, ключ снят', async () => {
    saveNativeAttempt(NATIVE_ATTEMPT_ID);
    mockApiByPath({ '/auth/me': GUEST });
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
    expect(oidcCalls()).toHaveLength(0);
  });
});

describe('TelegramLoginCallbackScreen — битая ссылка (POST не уходит вовсе)', () => {
  it.each([
    ['нет code/state', ''],
    ['нет state', `?code=${VALID_CODE}`],
    ['нет code', `?state=${VALID_STATE}`],
    ['state не по формату (не 43 base64url)', `?code=${VALID_CODE}&state=коротко`],
    ['code короче десяти знаков', `?code=abc&state=${VALID_STATE}`],
  ])('%s — «Ссылка не подошла», POST не уходит', async (_case, search) => {
    mockApiByPath({ '/auth/me': GUEST });
    renderScreen(search);

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(
      screen.getByText('Ссылка не подошла. Начните вход через Telegram заново.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('auth-status')).toHaveTextContent('guest'),
    );
    expect(oidcCalls()).toHaveLength(0);
  });
});
