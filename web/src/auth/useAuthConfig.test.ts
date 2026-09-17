import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useAuthConfig } from './useAuthConfig';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useAuthConfig', () => {
  it('пока конфиг не пришёл — status loading, config пуст', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAuthConfig());

    expect(result.current.status).toBe('loading');
    expect(result.current.config).toBeNull();
  });

  it('успешный ответ без бота — status ok, telegramBotId отсутствует (не «нет связи»)', async () => {
    const config: AuthConfigDto = {
      schoolSiteUrl: 'https://xuanxue.su',
      emailLoginEnabled: false,
    };
    mockedApiFetch.mockResolvedValue(config);

    const { result } = renderHook(() => useAuthConfig());

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.config).toEqual(config);
  });

  it('успешный ответ с ботом — telegramBotId заполнен', async () => {
    const config: AuthConfigDto = {
      telegramBotId: 123456,
      schoolSiteUrl: 'https://x.example',
      emailLoginEnabled: false,
    };
    mockedApiFetch.mockResolvedValue(config);

    const { result } = renderHook(() => useAuthConfig());

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.config?.telegramBotId).toBe(123456);
  });

  it('сетевой сбой — status offline, не ok (LoginScreen не должен решить «бот не настроен»)', async () => {
    mockedApiFetch.mockRejectedValue(new Error('сеть недоступна'));

    const { result } = renderHook(() => useAuthConfig());

    await waitFor(() => expect(result.current.status).toBe('offline'));
    expect(result.current.config).toBeNull();
  });

  it('reload() повторяет запрос', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));
    const config: AuthConfigDto = {
      telegramBotId: 1,
      schoolSiteUrl: 'https://x.example',
      emailLoginEnabled: false,
    };
    mockedApiFetch.mockResolvedValueOnce(config);

    const { result } = renderHook(() => useAuthConfig());
    await waitFor(() => expect(result.current.status).toBe('offline'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.status).toBe('ok');
    expect(result.current.config).toEqual(config);
  });

  it('устаревший ответ (после более нового reload) не перетирает состояние', async () => {
    let resolveFirst: ((value: AuthConfigDto) => void) | undefined;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const fresh: AuthConfigDto = {
      telegramBotId: 2,
      schoolSiteUrl: 'https://fresh.example',
      emailLoginEnabled: false,
    };
    mockedApiFetch.mockResolvedValueOnce(fresh);

    const { result } = renderHook(() => useAuthConfig());
    await act(async () => {
      await result.current.reload();
    });

    act(() => {
      resolveFirst?.({
        telegramBotId: 1,
        schoolSiteUrl: 'https://stale.example',
        emailLoginEnabled: false,
      });
    });

    expect(result.current.config).toEqual(fresh);
  });

  // enabled=false (ревью PR #150) — JoinScreen выключает хук, пока authStatus не
  // стал 'guest': вошедшего/заблокированного сразу уводит, конфигурация не нужна.
  it('enabled: false — запрос не уходит, status остаётся loading', () => {
    const { result } = renderHook(() => useAuthConfig(false));

    expect(result.current.status).toBe('loading');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
