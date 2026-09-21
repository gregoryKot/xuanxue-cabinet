// Состояние формы держится по itemId (комментарий в самом хуке) — тесты
// проверяют именно это: сбой и pending одного вопроса не задевают другой.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useAttemptMedia } from './useAttemptMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useAttemptMedia — ссылка на видео', () => {
  it('успех: POST на media/link с телом { url, itemId }, потом reload', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptMedia('a1', reload));

    let ok = false;
    await act(async () => {
      ok = await result.current.addMediaLink('q3', 'https://example.com/v');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/link', {
      method: 'POST',
      body: { url: 'https://example.com/v', itemId: 'q3' },
    });
    expect(ok).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.linkStateFor('q3')).toEqual({ pending: false, error: null });
  });

  it('сбой сервера — ошибка видна только у своего вопроса, у другого пусто', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Это не похоже на ссылку на видео.', 400, 'invalid_input'),
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptMedia('a1', reload));

    let ok = true;
    await act(async () => {
      ok = await result.current.addMediaLink('q3', 'не-ссылка');
    });

    expect(ok).toBe(false);
    expect(result.current.linkStateFor('q3').error?.message).toBe(
      'Это не похоже на ссылку на видео.',
    );
    expect(result.current.linkStateFor('q4')).toEqual({ pending: false, error: null });
  });

  it('во время запроса pending виден только у своего вопроса', async () => {
    let resolveFetch: (() => void) | undefined;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve(undefined);
        }),
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptMedia('a1', reload));

    let pendingCall: Promise<boolean> | undefined;
    act(() => {
      pendingCall = result.current.addMediaLink('q3', 'https://example.com/v');
    });

    await waitFor(() => expect(result.current.linkStateFor('q3').pending).toBe(true));
    expect(result.current.linkStateFor('q4').pending).toBe(false);

    await act(async () => {
      resolveFetch?.();
      await pendingCall;
    });
  });
});

// ADR-0086: снять ошибочную ссылку — тот же приём, что addMediaLink
// (read-after-write), но своё состояние: removeStateFor не должен путаться
// с linkStateFor формы того же вопроса.
describe('useAttemptMedia — убрать ссылку', () => {
  it('успех: DELETE на media/:mediaId, потом reload', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptMedia('a1', reload));

    let ok = false;
    await act(async () => {
      ok = await result.current.removeMedia('m1');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/m1', {
      method: 'DELETE',
    });
    expect(ok).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.removeStateFor('m1')).toEqual({ pending: false, error: null });
  });

  it('сбой сервера — текст ошибки виден как есть, у другой записи пусто', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Работу уже проверили, менять ответ поздно.', 400, 'invalid_input'),
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptMedia('a1', reload));

    let ok = true;
    await act(async () => {
      ok = await result.current.removeMedia('m1');
    });

    expect(ok).toBe(false);
    expect(result.current.removeStateFor('m1').error?.message).toBe(
      'Работу уже проверили, менять ответ поздно.',
    );
    expect(result.current.removeStateFor('m2')).toEqual({ pending: false, error: null });
  });

  it('во время запроса pending виден только у своей записи, форма вопроса не задета', async () => {
    let resolveFetch: (() => void) | undefined;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve(undefined);
        }),
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptMedia('a1', reload));

    let pendingCall: Promise<boolean> | undefined;
    act(() => {
      pendingCall = result.current.removeMedia('m1');
    });

    await waitFor(() => expect(result.current.removeStateFor('m1').pending).toBe(true));
    expect(result.current.removeStateFor('m2').pending).toBe(false);
    expect(result.current.linkStateFor('q3')).toEqual({ pending: false, error: null });

    await act(async () => {
      resolveFetch?.();
      await pendingCall;
    });
  });
});
