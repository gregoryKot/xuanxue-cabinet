// Хук проверяет только код ссылки (ADR-0030/0036) — сама регистрация
// переехала в POST /auth/telegram/POST /auth/email/verify, здесь больше
// нечего вызывать после входа, поэтому AuthProvider не нужен.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useJoinByInvite } from './useJoinByInvite';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const CODE = 'a'.repeat(32);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useJoinByInvite', () => {
  it('код действует — checkStatus valid', async () => {
    mockedApiFetch.mockResolvedValue({ valid: true });

    const { result } = renderHook(() => useJoinByInvite(CODE));

    await waitFor(() => expect(result.current.checkStatus).toBe('valid'));
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/join/check', {
      method: 'POST',
      body: { code: CODE },
    });
  });

  it('код не действует — checkStatus invalid', async () => {
    mockedApiFetch.mockResolvedValue({ valid: false });

    const { result } = renderHook(() => useJoinByInvite(CODE));

    await waitFor(() => expect(result.current.checkStatus).toBe('invalid'));
  });

  it('сеть недоступна при проверке — checkStatus offline, retryCheck повторяет запрос', async () => {
    let attempt = 0;
    mockedApiFetch.mockImplementation(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ valid: true });
    });

    const { result } = renderHook(() => useJoinByInvite(CODE));
    await waitFor(() => expect(result.current.checkStatus).toBe('offline'));

    result.current.retryCheck();

    await waitFor(() => expect(result.current.checkStatus).toBe('valid'));
  });

  it('unmount до ответа check (успех) — отписанный эффект не падает', async () => {
    let resolveCheck: (value: { valid: boolean }) => void = () => {};
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        }),
    );

    const { unmount } = renderHook(() => useJoinByInvite(CODE));
    unmount();
    resolveCheck({ valid: true });

    // Ничего не бросает после unmount — сам факт, что тест дошёл сюда без
    // ошибки, и есть проверка (cancelled-гвард эффекта в useJoinByInvite.ts).
    await Promise.resolve();
    await Promise.resolve();
  });

  it('unmount до ответа check (сеть упала) — отписанный catch не падает', async () => {
    let rejectCheck: (err: Error) => void = () => {};
    mockedApiFetch.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectCheck = reject;
        }),
    );

    const { unmount } = renderHook(() => useJoinByInvite(CODE));
    unmount();
    rejectCheck(new Error('boom'));

    await Promise.resolve();
    await Promise.resolve();
  });

  // Код вне формата (32 hex) сервер отверг бы 400-м — проверяем формат ДО
  // запроса, чтобы отличить «ссылка не подошла» от «нет связи» (ревью PR #150).
  it('код не по формату (не 32 hex) — checkStatus invalid без запроса', () => {
    const { result } = renderHook(() => useJoinByInvite('xyz'));

    expect(result.current.checkStatus).toBe('invalid');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('сервер отверг код 400-м (validation) — checkStatus invalid, не offline', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Код не подходит по формату.', 400, 'invalid_input'),
    );

    const { result } = renderHook(() => useJoinByInvite(CODE));

    await waitFor(() => expect(result.current.checkStatus).toBe('invalid'));
  });

  it('сетевой сбой (ApiError status 0) — checkStatus offline', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Нет связи', 0, 'network'));

    const { result } = renderHook(() => useJoinByInvite(CODE));

    await waitFor(() => expect(result.current.checkStatus).toBe('offline'));
  });

  // enabled=false (ревью PR #150) — JoinScreen выключает хук, пока authStatus не
  // стал 'guest': вошедшего/заблокированного сразу уводит, звать check незачем.
  it('enabled: false — запрос не уходит, checkStatus остаётся loading', () => {
    const { result } = renderHook(() => useJoinByInvite(CODE, false));

    expect(result.current.checkStatus).toBe('loading');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
