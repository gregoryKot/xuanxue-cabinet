import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useBroadcastCreate } from './useBroadcastCreate';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

const INPUT = {
  text: 'Текст',
  channelIds: ['ch1'],
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
};

describe('useBroadcastCreate', () => {
  it('шлёт POST /broadcasts телом формы', async () => {
    mockedApiFetch.mockResolvedValueOnce({});
    const { result } = renderHook(() => useBroadcastCreate());

    await result.current(INPUT);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/broadcasts',
      expect.objectContaining({ method: 'POST', body: INPUT }),
    );
  });

  it('ошибка сервера доходит до вызывающего — форма покажет её сама', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Канал выключен.', 400, 'invalid_input'),
    );
    const { result } = renderHook(() => useBroadcastCreate());

    await expect(result.current(INPUT)).rejects.toThrow('Канал выключен.');
  });

  it('между рендерами это одна и та же функция — форма не пересобирается', () => {
    const { result, rerender } = renderHook(() => useBroadcastCreate());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
