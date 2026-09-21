// Хук не грузит карточку сам (в отличие от useAttemptReview.ts) — reload
// приходит параметром, как в attempt/useAttemptMedia.test.ts, поэтому
// result.current полностью готов сразу, без waitFor на первую загрузку.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useAttemptReviewMedia } from './useAttemptReviewMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useAttemptReviewMedia — ручная отметка видео (у своего вопроса, ADR-0037)', () => {
  it('успех: POST на media/manual с itemId, потом reload (read-after-write)', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptReviewMedia('a1', reload));

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.markMediaManual('q1');
    });

    expect(succeeded).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/manual', {
      method: 'POST',
      body: { itemId: 'q1' },
    });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.markMediaStateFor('q1')).toEqual({
      pending: false,
      error: null,
    });
  });

  it('сбой сервера — ошибка видна только у отмеченного вопроса, false возвращается, reload не зовётся', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сеть подвела', 500, 'internal_error'),
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptReviewMedia('a1', reload));

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.markMediaManual('q1');
    });

    expect(succeeded).toBe(false);
    expect(result.current.markMediaStateFor('q1').error?.message).toBe('Сеть подвела');
    expect(result.current.markMediaStateFor('q2')).toEqual({
      pending: false,
      error: null,
    });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('useAttemptReviewMedia — прислать себе видео из Telegram (доп. к ADR-0023)', () => {
  it('до первой отправки — состояние idle у любого mediaId', () => {
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptReviewMedia('a1', reload));

    expect(result.current.sendMediaStateFor('m1')).toEqual({
      pending: false,
      error: null,
      sent: false,
    });
  });

  it('успех: POST на media/:mediaId/send-to-me без тела, sent — true, reload не зовётся', async () => {
    mockedApiFetch.mockResolvedValueOnce(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptReviewMedia('a1', reload));

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.sendMediaToMe('m1');
    });

    expect(succeeded).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/m1/send-to-me', {
      method: 'POST',
    });
    // Не read-after-write: 204 ничего не меняет на сервере (поменялся чат в
    // Telegram) — в отличие от markMediaManual выше, reload здесь не зовётся.
    expect(reload).not.toHaveBeenCalled();
    expect(result.current.sendMediaStateFor('m1')).toEqual({
      pending: false,
      error: null,
      sent: true,
    });
  });

  it('сбой сервера — ошибка видна только у отправленной записи, false возвращается, sent — false', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('У вас нет активного чата с ботом.', 409, 'conflict'),
    );
    const reload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAttemptReviewMedia('a1', reload));

    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.sendMediaToMe('m1');
    });

    expect(succeeded).toBe(false);
    expect(result.current.sendMediaStateFor('m1')).toEqual({
      pending: false,
      error: { message: 'У вас нет активного чата с ботом.', details: undefined },
      sent: false,
    });
    expect(result.current.sendMediaStateFor('m2')).toEqual({
      pending: false,
      error: null,
      sent: false,
    });
  });
});
