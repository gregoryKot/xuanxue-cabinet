import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useDeliveryText } from './useDeliveryText';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useDeliveryText', () => {
  it('ensureLoaded — запрашивает /deliveries/:id, возвращает и хранит текст', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'manual',
      attempts: 0,
      text: 'Через 30 минут занятие',
    });
    const { result } = renderHook(() => useDeliveryText('d1'));

    let loaded: string | undefined;
    await act(async () => {
      loaded = await result.current.ensureLoaded();
    });

    expect(mockedApiFetch).toHaveBeenCalledWith('/deliveries/d1');
    expect(loaded).toBe('Через 30 минут занятие');
    expect(result.current.text).toBe('Через 30 минут занятие');
  });

  it('повторный ensureLoaded — без второго запроса', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'manual',
      attempts: 0,
      text: 'Пост',
    });
    const { result } = renderHook(() => useDeliveryText('d1'));

    await act(async () => {
      await result.current.ensureLoaded();
    });
    await act(async () => {
      await result.current.ensureLoaded();
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('ApiError — текст сервера в error, ensureLoaded возвращает undefined', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Доставка не найдена.', 404, 'not_found'),
    );
    const { result } = renderHook(() => useDeliveryText('d1'));

    let loaded: string | undefined = 'нетронуто';
    await act(async () => {
      loaded = await result.current.ensureLoaded();
    });

    expect(loaded).toBeUndefined();
    expect(result.current.error).toBe('Доставка не найдена.');
  });

  it('не-ApiError сбой — общий текст', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useDeliveryText('d1'));

    await act(async () => {
      await result.current.ensureLoaded();
    });

    expect(result.current.error).toBe(
      'Не удалось загрузить текст доставки. Попробуйте ещё раз.',
    );
  });
});
