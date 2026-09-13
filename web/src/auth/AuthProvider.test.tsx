import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider, useAuth } from './AuthProvider';

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
      tz: 'Asia/Jerusalem',
      status: 'active',
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

  it('clear() сбрасывает сессию до guest', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
      status: 'active',
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
