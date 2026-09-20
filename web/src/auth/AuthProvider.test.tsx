import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider, hasSession, useAuth } from './AuthProvider';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe('useAuth вне AuthProvider', () => {
  it('бросает понятную ошибку', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth() вызван вне');
  });
});

describe('AuthProvider — статусы', () => {
  it('успешный /auth/me — status ok, me заполнен', async () => {
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
    mockedApiFetch.mockResolvedValue(me);

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.me).toEqual(me);
  });

  it('401 — status guest', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Войдите', 401, 'unauthorized'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('guest'));
    expect(result.current.me).toBeNull();
  });

  it('сетевой сбой (status 0) — offline, не guest', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Нет связи', 0, 'network'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('offline'));
  });

  // Задача 3: AuthGuard отвергает status: 'blocked' 403-м на каждый запрос
  // (SECURITY §2) — cookie при этом валиден, это не «сессии нет».
  it('403 — status blocked, me null', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Доступа нет. Обратитесь к администратору школы.', 403, 'forbidden'),
    );

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('blocked'));
    expect(result.current.me).toBeNull();
  });

  it('clear() сбрасывает сессию до guest', async () => {
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
    mockedApiFetch.mockResolvedValue(me);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('ok'));

    act(() => {
      result.current.clear();
    });

    expect(result.current.status).toBe('guest');
    expect(result.current.me).toBeNull();
  });
});

describe('hasSession', () => {
  it('true для ok и blocked (сессия есть), false для остального', () => {
    expect(hasSession('ok')).toBe(true);
    expect(hasSession('blocked')).toBe(true);
    expect(hasSession('guest')).toBe(false);
    expect(hasSession('offline')).toBe(false);
    expect(hasSession('loading')).toBe(false);
  });
});
