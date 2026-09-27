import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useFileStorageEnabled } from './useFileStorageEnabled';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});
const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useFileStorageEnabled', () => {
  it('R2 подключён — true', async () => {
    mockedApiFetch.mockResolvedValue({ fileStorageEnabled: true });
    const { result } = renderHook(() => useFileStorageEnabled());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('R2 не подключён — false', async () => {
    mockedApiFetch.mockResolvedValue({ fileStorageEnabled: false });
    const { result } = renderHook(() => useFileStorageEnabled());
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('конфигурация не пришла — false, не кнопка, которая ответит 503', async () => {
    mockedApiFetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useFileStorageEnabled());
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
