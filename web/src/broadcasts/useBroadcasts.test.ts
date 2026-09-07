import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import type { JournalRangeWeeks } from './broadcastWindow';
import { useBroadcasts } from './useBroadcasts';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useBroadcasts — загрузка', () => {
  it('монтирование — один запрос /broadcasts (pr-k3-fixes.md п.17)', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBroadcasts(2, ''));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/broadcasts\?from=.+&to=.+&limit=200$/),
      expect.anything(),
    );
  });

  it('с фильтром статуса — параметр status в запросе', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBroadcasts(2, 'sent'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/&status=sent&/),
      expect.anything(),
    );
  });

  it('смена периода — новый запрос с более широким окном', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result, rerender } = renderHook(
      ({ weeks }: { weeks: JournalRangeWeeks }) => useBroadcasts(weeks, ''),
      { initialProps: { weeks: 2 } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockedApiFetch.mock.calls.length;

    rerender({ weeks: 8 });

    await waitFor(() =>
      expect(mockedApiFetch.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    const lastCall = mockedApiFetch.mock.calls.at(-1)?.[0] as string;
    const from = new URL(lastCall, 'http://x').searchParams.get('from');
    const to = new URL(lastCall, 'http://x').searchParams.get('to');
    const days =
      (new Date(to as string).getTime() - new Date(from as string).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(days).toBe(56);
  });
});

describe('useBroadcasts — мутации (read-after-write)', () => {
  it('create — POST /broadcasts с телом, затем последний вызов — GET /broadcasts', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBroadcasts(2, ''));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([]);
    await act(async () => {
      await result.current.create({ text: 'Текст', channelIds: ['ch1'] });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/broadcasts',
      expect.objectContaining({
        method: 'POST',
        body: { text: 'Текст', channelIds: ['ch1'] },
      }),
    );
    const lastCall = mockedApiFetch.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatch(/^\/broadcasts\?from=/);
    expect((lastCall?.[1] as { method?: string } | undefined)?.method ?? 'GET').toBe(
      'GET',
    );
  });

  it('cancel — POST /broadcasts/:id/cancel, затем последний вызов — GET /broadcasts', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBroadcasts(2, ''));
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([]);
    await act(async () => {
      await result.current.cancel('b1');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/broadcasts/b1/cancel',
      expect.objectContaining({ method: 'POST' }),
    );
    const lastCall = mockedApiFetch.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatch(/^\/broadcasts\?from=/);
  });
});
