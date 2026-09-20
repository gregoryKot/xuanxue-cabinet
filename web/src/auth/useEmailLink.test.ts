// Юнит-тест хука без формы/DOM (CLAUDE.md «Тесты») — переходы idle → pending
// → sent/error, refresh() после успеха (read-after-write) и текст ошибки.
// Сеть замокана через apiFetch (тот же приём, что useEmailLoginRequest.test.ts).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_LINK_TAKEN_MESSAGE } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useEmailLink } from './useEmailLink';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useEmailLink', () => {
  it('изначально idle, ошибки нет', () => {
    const { result } = renderHook(() => useEmailLink(vi.fn()));

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('успех — POST /auth/email/link с адресом, затем refresh(), status sent', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLink(refresh));

    await act(() => result.current.link('a@example.com'));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/link', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('sent');
    expect(result.current.error).toBeNull();
  });

  it('409 — адрес занят другим аккаунтом: status error, текст с сервера, refresh() не вызван', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(EMAIL_LINK_TAKEN_MESSAGE, 409, 'conflict'),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLink(refresh));

    await act(() => result.current.link('a@example.com'));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(EMAIL_LINK_TAKEN_MESSAGE);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailLink(vi.fn()));

    await act(() => result.current.link('a@example.com'));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});
