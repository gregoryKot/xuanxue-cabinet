// Экран входа и возврат из wiki (ADR-0183): адрес входа из wiki принимается из
// `?returnTo=`, уже вошедшего ведёт на него, гость после входа в другой
// вкладке подхватывает сессию при возврате к этой. Рядом с LoginScreen.test.tsx,
// а не в нём: тот уже за границей размера. Сеть — по пути запроса.
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { makeMe } from '../test-support/meFixture';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { AuthProvider, useAuth } from './AuthProvider';
import LoginScreen from './LoginScreen';
import { hasPendingWikiReturn } from './returnTo';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const WIKI_PATH = '/wiki?returnTo=%2Fa';
const WIKI_SEARCH = `?returnTo=${encodeURIComponent(WIKI_PATH)}`;
const GUEST = new ApiError('Войдите', 401, 'unauthorized');

function mockSession(me: unknown) {
  mockApiByPath({ '/auth/me': me, '/auth/config': { telegramBotId: 42 } });
}

function meCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/me').length;
}

/** Адрес, на который приложение перешло: так видно, куда увело вошедшего. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p data-testid="location">{`${pathname}${search}`}</p>;
}

function AuthStatusProbe() {
  return <span data-testid="auth-status">{useAuth().status}</span>;
}

function renderScreen(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/login${search}`]}>
      <AuthProvider>
        <AuthStatusProbe />
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginScreen — возврат из wiki', () => {
  it('вошедший уходит на адрес входа из wiki, не на главную', async () => {
    mockSession(makeMe());
    renderScreen(WIKI_SEARCH);

    expect(await screen.findByTestId('location')).toHaveTextContent(WIKI_PATH);
  });

  it('гость видит форму, адрес для возврата хранится до входа', async () => {
    mockSession(GUEST);
    renderScreen(WIKI_SEARCH);

    expect(
      await screen.findByRole('button', { name: 'Войти через Telegram' }),
    ).toBeInTheDocument();
    expect(hasPendingWikiReturn()).toBe(true);
  });

  it('returnTo не на wiki игнорируется: вошедший идёт на главную, открытого редиректа нет', async () => {
    mockSession(makeMe());
    renderScreen('?returnTo=%2Fexams');

    expect(await screen.findByTestId('location')).toHaveTextContent('/');
    expect(screen.getByTestId('location')).not.toHaveTextContent('exams');
    expect(hasPendingWikiReturn()).toBe(false);
  });
});

/** Гость, на экране которого возврат к вкладке уже слушается. Ни кнопки
 * входа, ни ушедшего /auth/me мало: /auth/config уходит раньше и кнопка бывает
 * на экране при статусе 'loading', а useSessionRecheckOnReturn подписывается
 * только после ответа /auth/me (красный CI на main, 5838fa5, 2026-10-17). */
async function renderGuestScreen(search: string) {
  mockSession(GUEST);
  renderScreen(search);
  await screen.findByRole('button', { name: 'Войти через Telegram' });
  await waitFor(() =>
    expect(screen.getByTestId('auth-status')).toHaveTextContent('guest'),
  );
}

describe('LoginScreen — вход завершился в другой вкладке', () => {
  it('гость с возвратом в wiki: фокус перечитывает сессию и ведёт на wiki', async () => {
    await renderGuestScreen(WIKI_SEARCH);
    expect(meCalls()).toBe(1);

    mockSession(makeMe());
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByTestId('location')).toHaveTextContent(WIKI_PATH);
    expect(meCalls()).toBe(2);
  });

  it('гость без возврата в wiki: фокус сессию не перечитывает', async () => {
    await renderGuestScreen('');
    expect(meCalls()).toBe(1);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(meCalls()).toBe(1);
  });
});
