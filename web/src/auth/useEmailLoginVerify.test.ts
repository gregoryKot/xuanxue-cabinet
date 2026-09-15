// Хук в изоляции, без экрана (тот же приём, что useTelegramAuthResultLogin.test.ts):
// useNavigate замокан отдельно от react-router-dom.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from 'react-router-dom';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { saveReturnTo } from './returnTo';
import { useEmailLoginVerify } from './useEmailLoginVerify';

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

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
  sessionStorage.clear();
});

describe('useEmailLoginVerify', () => {
  it('успех, нет сохранённого returnTo — POST /auth/email/verify, refresh(), переход на «/»', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh));

    await act(() => result.current.verify('a'.repeat(64)));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: 'a'.repeat(64) },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(result.current.error).toBeNull();
  });

  it('успех, сохранён returnTo /planning?week=2 (аудит L2) — переход туда', async () => {
    saveReturnTo('/planning?week=2');
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh));

    await act(() => result.current.verify('a'.repeat(64)));

    expect(navigateMock).toHaveBeenCalledWith('/planning?week=2', { replace: true });
  });

  it('ApiError — status error, текст с сервера, refresh() и переход не вызваны', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Ссылка устарела или уже использована. Запросите новую на странице входа.',
        401,
        'unauthorized',
      ),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh));

    await act(() => result.current.verify('a'.repeat(64)));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'Ссылка устарела или уже использована. Запросите новую на странице входа.',
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailLoginVerify(vi.fn()));

    await act(() => result.current.verify('a'.repeat(64)));

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('joinCode (ADR-0030) — после verify зовёт POST /auth/join, потом переход на «/»', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh, 'a'.repeat(32)));

    await act(() => result.current.verify('t'.repeat(64)));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/join', {
      method: 'POST',
      body: { code: 'a'.repeat(32) },
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(result.current.joinError).toBeNull();
  });

  it('join упал — joinError виден, вход не блокирован, редирект не уводит сам', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/email/verify') return Promise.resolve(undefined);
      if (path === '/auth/join')
        return Promise.reject(
          new ApiError('Ссылка-приглашение не действует.', 401, 'unauthorized'),
        );
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh, 'a'.repeat(32)));

    await act(() => result.current.verify('t'.repeat(64)));

    expect(result.current.joinError).toBe('Ссылка-приглашение не действует.');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();

    result.current.continueToSchedule();
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('join упал не ApiError — общий текст «Нет связи…» в joinError', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/email/verify') return Promise.resolve(undefined);
      if (path === '/auth/join') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh, 'a'.repeat(32)));

    await act(() => result.current.verify('t'.repeat(64)));

    expect(result.current.joinError).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});
