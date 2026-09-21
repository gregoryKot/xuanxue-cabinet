// Хук в изоляции, без экрана (тот же приём, что useEmailLoginVerify.test.ts):
// useNavigate замокан отдельно от react-router-dom, refresh — обычный
// vi.fn(), без <AuthProvider> в дереве.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from 'react-router-dom';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { saveReturnTo } from './returnTo';
import { useEmailCodeLogin } from './useEmailCodeLogin';

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

describe('useEmailCodeLogin', () => {
  it('успех — POST /auth/email/code с адресом и кодом, refresh(), переход на postLoginPath()', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailCodeLogin(refresh));

    await result.current.submit('a@example.com', '123456');

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/code', {
      method: 'POST',
      body: { email: 'a@example.com', code: '123456' },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
  });

  it('inviteCode (ADR-0030/0036) — едет в теле вместе с адресом и кодом', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailCodeLogin(refresh, 'a'.repeat(32)));

    await result.current.submit('a@example.com', '123456');

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/code', {
      method: 'POST',
      body: { email: 'a@example.com', code: '123456', inviteCode: 'a'.repeat(32) },
    });
  });

  it('успех, сохранён returnTo /planning?week=2 (аудит L2) — переход туда', async () => {
    saveReturnTo('/planning?week=2');
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailCodeLogin(refresh));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/planning?week=2', { replace: true }),
    );
  });

  it('ApiError (401 — код не подошёл) — текст с сервера в error, refresh() и переход не вызваны', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Код не подошёл. Сверьте цифры с письмом или запросите новое.',
        401,
        'unauthorized',
      ),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailCodeLogin(refresh));

    await result.current.submit('a@example.com', '000000');

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'Код не подошёл. Сверьте цифры с письмом или запросите новое.',
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailCodeLogin(vi.fn()));

    await result.current.submit('a@example.com', '123456');

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    );
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
