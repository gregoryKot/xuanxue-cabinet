// Экран входа для Daychi (`/login/native?attempt=…`, ADR-0181, «Браузер»).
// Переход вкладки на `continue` замокан (redirectCurrentTab, тот же приём, что
// у GoogleLoginButton.test.tsx): настоящий window.location.assign увёл бы jsdom
// со страницы. Сеть — по пути запроса (mockApiByPath), не очередью.
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import type * as TelegramRedirectModule from './telegramAuthRedirect';
import { redirectCurrentTab } from './telegramAuthRedirect';
import { makeMe } from '../test-support/meFixture';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { AuthProvider, useAuth } from './AuthProvider';
import { peekNativeAttempt, saveNativeAttempt } from './nativeAttempt';
import NativeLoginScreen from './NativeLoginScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectCurrentTab: vi.fn() };
});

const redirectSpy = vi.mocked(redirectCurrentTab);
resetApiFetchBetweenTests();

const ATTEMPT_ID = '0123456789abcdef01234567';
const OTHER_ATTEMPT_ID = 'fedcba9876543210fedcba98';
const CONTINUE_URL = `/api/auth/native/continue?attempt=${ATTEMPT_ID}`;
const CONFIG: AuthConfigDto = {
  telegramBotId: 42,
  googleLoginEnabled: true,
  emailLoginEnabled: true,
  fileStorageEnabled: false,
};
const GUEST = new ApiError('Войдите', 401, 'unauthorized');
const BLOCKED = new ApiError(
  'Доступа нет. Обратитесь к администратору школы.',
  403,
  'forbidden',
);

afterEach(() => {
  redirectSpy.mockClear();
  sessionStorage.clear();
});

function mockMe(me: unknown) {
  mockApiByPath({ '/auth/me': me, '/auth/config': CONFIG });
}

function meCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/me').length;
}

/** Статус сессии рядом с экраном: тупику нечего показать по ответу /auth/me,
 * а проверить «перехода нет» надо уже после ответа, не до него. */
function AuthStatusProbe() {
  return <span data-testid="auth-status">{useAuth().status}</span>;
}

function renderScreen(search: string, wrapper?: typeof StrictMode) {
  return render(
    <MemoryRouter initialEntries={[`/login/native${search}`]}>
      <AuthProvider>
        <AuthStatusProbe />
        <Routes>
          <Route path="/login/native" element={<NativeLoginScreen />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

describe('NativeLoginScreen — гость', () => {
  it('объяснение, те же способы входа, что у кабинета, и номер попытки — в ключе вкладки', async () => {
    mockMe(GUEST);
    renderScreen(`?attempt=${ATTEMPT_ID}`);

    expect(
      screen.getByRole('heading', { name: 'Вход в приложение Daychi' }),
    ).toBeInTheDocument();
    expect(screen.getByText('откроется само')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Войти через Google' }),
    ).toBeInTheDocument();
    expect(screen.getByText('или по почте')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Вернуться в приложение' }),
    ).toBeInTheDocument();
    expect(peekNativeAttempt()).toBe(ATTEMPT_ID);
    expect(redirectSpy).not.toHaveBeenCalled();
  });

  it('«Вернуться в приложение» — continue с отменой, ключ снят', async () => {
    const user = userEvent.setup();
    mockMe(GUEST);
    renderScreen(`?attempt=${ATTEMPT_ID}`);

    await user.click(
      await screen.findByRole('button', { name: 'Вернуться в приложение' }),
    );

    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith(`${CONTINUE_URL}&cancel=1`);
    expect(peekNativeAttempt()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Открываем Daychi');
  });
});

describe('NativeLoginScreen — сессия есть', () => {
  it.each([
    ['активный', makeMe()],
    ['заблокированный — Daychi получит отказ от сервера', BLOCKED],
  ])(
    '%s — один полный переход на continue своей попытки, ключ снят',
    async (_label, me) => {
      mockMe(me);
      renderScreen(`?attempt=${ATTEMPT_ID}`);

      await waitFor(() => expect(redirectSpy).toHaveBeenCalledWith(CONTINUE_URL));
      expect(redirectSpy).toHaveBeenCalledTimes(1);
      expect(peekNativeAttempt()).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent('Открываем Daychi');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('в ключе вкладки чужой номер — уходит номер из адреса', async () => {
    saveNativeAttempt(OTHER_ATTEMPT_ID);
    mockMe(makeMe());
    renderScreen(`?attempt=${ATTEMPT_ID}`);

    await waitFor(() => expect(redirectSpy).toHaveBeenCalledWith(CONTINUE_URL));
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(peekNativeAttempt()).toBeNull();
  });

  it('StrictMode вызывает эффект дважды — переход всё равно один', async () => {
    mockMe(makeMe());
    renderScreen(`?attempt=${ATTEMPT_ID}`, StrictMode);

    await waitFor(() => expect(redirectSpy).toHaveBeenCalled());
    expect(redirectSpy).toHaveBeenCalledTimes(1);
  });
});

describe('NativeLoginScreen — в адресе нет годного номера', () => {
  it.each([
    ['номера нет', ''],
    ['номер не по формату', '?attempt=abc'],
  ])(
    '%s — «начните вход заново», без перехода, даже с сессией и номером в ключе',
    async (_label, search) => {
      saveNativeAttempt(OTHER_ATTEMPT_ID);
      mockMe(makeMe());
      renderScreen(search);

      expect(
        screen.getByText('Вернитесь в приложение Daychi и начните вход заново.'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByTestId('auth-status')).toHaveTextContent('ok'),
      );
      expect(redirectSpy).not.toHaveBeenCalled();
      expect(peekNativeAttempt()).toBe(OTHER_ATTEMPT_ID);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
});

describe('NativeLoginScreen — вход завершился в другой вкладке', () => {
  it('фокус после входа по письму — перечитывает сессию и продолжает свою попытку', async () => {
    mockMe(GUEST);
    renderScreen(`?attempt=${ATTEMPT_ID}`);
    await screen.findByRole('button', { name: 'Войти через Telegram' });

    mockMe(makeMe());
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(redirectSpy).toHaveBeenCalledWith(CONTINUE_URL));
    expect(redirectSpy).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange: скрытая вкладка не перечитывает, видимая — продолжает', async () => {
    mockMe(GUEST);
    renderScreen(`?attempt=${ATTEMPT_ID}`);
    await screen.findByRole('button', { name: 'Войти через Telegram' });
    mockMe(makeMe());
    const callsBefore = meCalls();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(meCalls()).toBe(callsBefore);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    Reflect.deleteProperty(document, 'visibilityState');

    await waitFor(() => expect(redirectSpy).toHaveBeenCalledWith(CONTINUE_URL));
  });

  it('после ухода с экрана фокус больше не перечитывает сессию', async () => {
    mockMe(GUEST);
    const { unmount } = renderScreen(`?attempt=${ATTEMPT_ID}`);
    await screen.findByRole('button', { name: 'Войти через Telegram' });
    unmount();
    const callsBefore = meCalls();

    window.dispatchEvent(new Event('focus'));

    expect(meCalls()).toBe(callsBefore);
  });
});
