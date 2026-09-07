import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useMarkSent } from './useMarkSent';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useMarkSent', () => {
  it('успех — POST /deliveries/:id/mark-sent, затем onSent', async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    const onSent = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useMarkSent(onSent));

    await act(async () => {
      await result.current.markSent('d1');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/deliveries/d1/mark-sent',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('ApiError — текст сервера в error, onSent не вызывается', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Доставка не найдена.', 404, 'not_found'),
    );
    const onSent = vi.fn();
    const { result } = renderHook(() => useMarkSent(onSent));

    await act(async () => {
      await result.current.markSent('d1');
    });

    expect(result.current.error).toBe('Доставка не найдена.');
    expect(onSent).not.toHaveBeenCalled();
  });

  it('не-ApiError сбой — общий текст', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useMarkSent(vi.fn()));

    await act(async () => {
      await result.current.markSent('d1');
    });

    expect(result.current.error).toBe(
      'Не удалось отметить отправленным. Попробуйте ещё раз.',
    );
  });
});
