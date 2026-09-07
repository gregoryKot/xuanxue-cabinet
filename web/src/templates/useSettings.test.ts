import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useSettings } from './useSettings';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useSettings — загрузка', () => {
  it('запрашивает /settings', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      templates: { lesson_link: '', recording: '' },
      tz: 'Asia/Jerusalem',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/settings', expect.anything());
  });
});

describe('useSettings — update() (read-after-write)', () => {
  it('PATCH /settings, затем reload', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      templates: { lesson_link: '', recording: '' },
      tz: 'Asia/Jerusalem',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce({
      templates: { lesson_link: 'Новый текст', recording: '' },
      tz: 'Asia/Jerusalem',
      updatedAt: '2026-01-02T00:00:00Z',
    });
    await act(async () => {
      await result.current.update({ templates: { lesson_link: 'Новый текст' } });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(result.current.settings?.templates.lesson_link).toBe('Новый текст');
  });
});
