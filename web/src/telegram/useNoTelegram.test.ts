// Юнит-тест хука без компонента/DOM (CLAUDE.md «Тесты») — тело запроса,
// read-after-write через refresh() и текст ошибки. Сеть замокана через
// apiFetch (тот же приём, что useEmailLink.test.ts).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useNoTelegram } from './useNoTelegram';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useNoTelegram', () => {
  it('изначально не занят, ошибки нет', () => {
    const { result } = renderHook(() => useNoTelegram(vi.fn()));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('постановка отметки — PUT с { noTelegram: true }, затем refresh()', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoTelegram(refresh));

    await act(() => result.current.set(true));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/no-telegram', {
      method: 'PUT',
      body: { noTelegram: true },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('снятие отметки — PUT с { noTelegram: false }', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoTelegram(refresh));

    await act(() => result.current.set(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/no-telegram', {
      method: 'PUT',
      body: { noTelegram: false },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ошибка сервера — текст в error, refresh() не вызван', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useNoTelegram(refresh));

    await act(() => result.current.set(true));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe('Сервер не ответил. Попробуйте ещё раз.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useNoTelegram(vi.fn()));

    await act(() => result.current.set(true));

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});
