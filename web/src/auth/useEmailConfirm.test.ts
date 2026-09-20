// Хук в изоляции (тот же приём, что useEmailLoginVerify.test.ts) — здесь нет
// ни навигации, ни refresh() сессии: подтверждение адреса, не вход. Проверка
// «token не null → запрос уходит один раз», текст ошибки и защита от
// двойного эффекта StrictMode.
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_CONFIRM_EXPIRED_MESSAGE } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useEmailConfirm } from './useEmailConfirm';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const TOKEN = 'a'.repeat(64);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useEmailConfirm', () => {
  it('token null — не отправляет запрос, статус с самого начала pending', () => {
    const { result } = renderHook(() => useEmailConfirm(null));

    expect(result.current.status).toBe('pending');
    expect(result.current.error).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('успех — POST /auth/email/confirm с токеном, статус success', async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailConfirm(TOKEN));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/confirm', {
      method: 'POST',
      body: { token: TOKEN },
    });
  });

  it('token появляется не сразу — запрос уходит, как только он не null', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ token }: { token: string | null }) => useEmailConfirm(token),
      { initialProps: { token: null as string | null } },
    );

    expect(mockedApiFetch).not.toHaveBeenCalled();

    rerender({ token: TOKEN });

    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('ApiError — status error, текст с сервера', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(EMAIL_CONFIRM_EXPIRED_MESSAGE, 401, 'unauthorized'),
    );

    const { result } = renderHook(() => useEmailConfirm(TOKEN));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(EMAIL_CONFIRM_EXPIRED_MESSAGE);
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useEmailConfirm(TOKEN));

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    );
  });

  it('StrictMode вызывает эффект дважды — POST уходит один раз (startedRef)', async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailConfirm(TOKEN), { wrapper: StrictMode });

    await waitFor(() => expect(result.current.status).toBe('success'));
    const calls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/email/confirm',
    );
    expect(calls).toHaveLength(1);
  });

  it('перерендер с тем же token — не отправляет запрос второй раз', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ token }: { token: string | null }) => useEmailConfirm(token),
      { initialProps: { token: TOKEN } },
    );

    await waitFor(() => expect(result.current.status).toBe('success'));

    rerender({ token: TOKEN });

    const calls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/email/confirm',
    );
    expect(calls).toHaveLength(1);
  });
});
