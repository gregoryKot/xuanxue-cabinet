// Хук изолирован от экрана (тот же приём, что useTelegramAuthResultLogin.test.ts):
// useNavigate замокан отдельно, AuthProvider — настоящий (нужен реальный
// authStatus-переход по ответу /auth/me), apiFetch — мок сети.
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as RouterModule from 'react-router-dom';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { useJoinByInvite } from './useJoinByInvite';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof RouterModule>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const mockedApiFetch = vi.mocked(apiFetch);
const CODE = 'a'.repeat(32);
const ME: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'invited',
  telegramLinked: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
});

describe('useJoinByInvite', () => {
  it('код не действует — checkStatus invalid, join не вызывается сам', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: false });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { result } = renderHook(() => useJoinByInvite(CODE), { wrapper });

    await waitFor(() => expect(result.current.checkStatus).toBe('invalid'));
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/join', expect.anything());
  });

  it('сеть недоступна при проверке — checkStatus offline, retryCheck повторяет запрос', async () => {
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
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { result } = renderHook(() => useJoinByInvite(CODE), { wrapper });
    await waitFor(() => expect(result.current.checkStatus).toBe('offline'));

    result.current.retryCheck();

    await waitFor(() => expect(result.current.checkStatus).toBe('valid'));
  });

  it('код действует, сессия уже есть (invited) — join() сам, refresh, переход на /schedule', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/join') return Promise.resolve({ ...ME, status: 'active' });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderHook(() => useJoinByInvite(CODE), { wrapper });

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/auth/join', {
        method: 'POST',
        body: { code: CODE },
      }),
    );
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/schedule', { replace: true }),
    );
  });

  it('код действует, сессии нет — checkStatus valid, join сам не вызывается', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { result } = renderHook(() => useJoinByInvite(CODE), { wrapper });

    await waitFor(() => expect(result.current.checkStatus).toBe('valid'));
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/join', expect.anything());
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('join() падает — error виден, navigate не вызван, повторный join() пробует снова', async () => {
    let joinAttempt = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/join') {
        joinAttempt += 1;
        return joinAttempt === 1
          ? Promise.reject(
              new ApiError('Ссылка-приглашение не действует.', 401, 'unauthorized'),
            )
          : Promise.resolve({ ...ME, status: 'active' });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { result } = renderHook(() => useJoinByInvite(CODE), { wrapper });

    await waitFor(() =>
      expect(result.current.error).toBe('Ссылка-приглашение не действует.'),
    );
    expect(navigateMock).not.toHaveBeenCalled();

    result.current.join();

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/schedule', { replace: true }),
    );
  });

  it('join() падает не ApiError — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/join') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { result } = renderHook(() => useJoinByInvite(CODE), { wrapper });

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    );
  });

  it('unmount до ответа check (успех) — отписанный эффект не падает', async () => {
    let resolveCheck: (value: { valid: boolean }) => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check')
        return new Promise((resolve) => {
          resolveCheck = resolve;
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { unmount } = renderHook(() => useJoinByInvite(CODE), { wrapper });
    unmount();
    resolveCheck({ valid: true });

    // Ничего не бросает после unmount — сам факт, что тест дошёл сюда без
    // ошибки, и есть проверка (cancelled-гвард эффекта в useJoinByInvite.ts).
    // Микротаск, не таймер (CLAUDE.md «Детерминизм») — .then() уже в очереди
    // после resolveCheck() выше, просто ждём её разбора.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('unmount до ответа check (сеть упала) — отписанный catch не падает', async () => {
    let rejectCheck: (err: Error) => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/join/check')
        return new Promise((_resolve, reject) => {
          rejectCheck = reject;
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { unmount } = renderHook(() => useJoinByInvite(CODE), { wrapper });
    unmount();
    rejectCheck(new Error('boom'));

    await Promise.resolve();
    await Promise.resolve();
  });

  it('join() дважды подряд синхронно — второй вызов не шлёт второй POST (startedRef)', async () => {
    let resolveJoin: (value: undefined) => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(ME);
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      if (path === '/auth/join')
        return new Promise((resolve) => {
          resolveJoin = resolve;
        });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    const { result } = renderHook(() => useJoinByInvite(CODE), { wrapper });
    await waitFor(() => expect(result.current.joining).toBe(true));
    const callsBefore = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/join',
    ).length;

    result.current.join();

    const callsAfter = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/join',
    ).length;
    expect(callsAfter).toBe(callsBefore);
    resolveJoin(undefined);
  });
});
