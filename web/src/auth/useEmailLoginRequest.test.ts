// Юнит-тест хука без формы/DOM (CLAUDE.md «Тесты») — переходы idle → pending
// → sent/error и текст ошибки. Сеть замокана через apiFetch (api/http.ts).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_LOGIN_RESEND_COOLDOWN_MIN } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useEmailLoginRequest } from './useEmailLoginRequest';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
  vi.useRealTimers();
});

describe('useEmailLoginRequest', () => {
  it('изначально idle, ничего не отправлено', () => {
    const { result } = renderHook(() => useEmailLoginRequest());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.sentOnce).toBe(false);
    expect(result.current.resendAvailableInSec).toBe(0);
  });

  // Аудит 2026-10-01, F30: в окне cooldown сервер молчит тем же 204 —
  // отсчёт ведёт форма, от момента успешной отправки, посекундно.
  it('после отправки — отсчёт cooldown, по истечении снова 0', async () => {
    vi.useFakeTimers();
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginRequest());
    const cooldownSec = EMAIL_LOGIN_RESEND_COOLDOWN_MIN * 60;

    await act(() => result.current.request('a@example.com'));
    expect(result.current.resendAvailableInSec).toBe(cooldownSec);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(result.current.resendAvailableInSec).toBe(cooldownSec - 30);

    await act(async () => {
      await vi.advanceTimersByTimeAsync((cooldownSec - 30) * 1000);
    });
    expect(result.current.resendAvailableInSec).toBe(0);
  });

  it('сбой отправки отсчёт не запускает', async () => {
    vi.useFakeTimers();
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailLoginRequest());

    await act(() => result.current.request('a@example.com'));

    expect(result.current.resendAvailableInSec).toBe(0);
  });

  it('успех — status sent, sentOnce true, POST с email в теле', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginRequest());

    await act(() => result.current.request('a@example.com'));

    expect(result.current.status).toBe('sent');
    expect(result.current.sentOnce).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
  });

  it('с inviteCode (ADR-0030) — POST несёт inviteCode в теле', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginRequest('a'.repeat(32)));

    await act(() => result.current.request('a@example.com'));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com', inviteCode: 'a'.repeat(32) },
    });
  });

  it('ApiError — status error, текст с сервера', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Email-вход пока не подключён.', 503, 'not_available'),
    );
    const { result } = renderHook(() => useEmailLoginRequest());

    await act(() => result.current.request('a@example.com'));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Email-вход пока не подключён.');
    expect(result.current.sentOnce).toBe(false);
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailLoginRequest());

    await act(() => result.current.request('a@example.com'));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('повторный сбой после успеха — sentOnce остаётся true', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useEmailLoginRequest());
    await act(() => result.current.request('a@example.com'));
    expect(result.current.sentOnce).toBe(true);

    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    await act(() => result.current.request('a@example.com'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.sentOnce).toBe(true);
  });
});
