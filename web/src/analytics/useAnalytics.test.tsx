import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsConfigDto, MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import type { AuthStatus } from '../auth/AuthProvider';
import { useAnalytics } from './useAnalytics';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});
const mockedApiFetch = vi.mocked(apiFetch);

const startAnalytics = vi.fn();
const reset = vi.fn();
const syncRecording = vi.fn();
vi.mock('./posthogClient', () => ({
  startAnalytics: (...args: unknown[]) => {
    startAnalytics(...args);
  },
  reset: (...args: unknown[]) => {
    reset(...args);
  },
  syncRecording: (...args: unknown[]) => {
    syncRecording(...args);
  },
}));

// useAuth подменён целиком — реальный AuthProvider сходил бы в сеть сам
// (refresh() на монтировании), а хуку здесь нужен только результат.
let authStatus: AuthStatus = 'guest';
let authMe: MeDto | null = null;
vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    status: authStatus,
    me: authMe,
    refresh: vi.fn(),
    applyMe: vi.fn(),
    clear: vi.fn(),
  }),
}));

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    noTelegram: false,
    hasEmail: true,
    googleLinked: false,
    needsProfile: false,
    studentMode: false,
    canUseStudentMode: false,
    homeHiddenTiles: [],
    ...overrides,
  };
}

function wrapperAt(path: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

afterEach(() => {
  authStatus = 'guest';
  authMe = null;
  mockedApiFetch.mockReset();
  startAnalytics.mockReset();
  reset.mockReset();
  syncRecording.mockReset();
});

describe('useAnalytics', () => {
  it('без сессии — конфиг не запрашивается', () => {
    renderHook(() => useAnalytics(), { wrapper: wrapperAt('/exams') });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('нет ключа в конфиге — клиент не импортируется и не стартует', async () => {
    authStatus = 'ok';
    authMe = makeMe();
    mockedApiFetch.mockResolvedValue({ posthogKey: null } satisfies AnalyticsConfigDto);

    renderHook(() => useAnalytics(), { wrapper: wrapperAt('/exams') });

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/analytics/config', { method: 'GET' }),
    );
    expect(startAnalytics).not.toHaveBeenCalled();
  });

  it('есть ключ — клиент стартует с id и ролью/статусом человека', async () => {
    authStatus = 'ok';
    authMe = makeMe({ id: 'u42', roles: ['admin'], status: 'active' });
    mockedApiFetch.mockResolvedValue({
      posthogKey: 'phc_example',
    } satisfies AnalyticsConfigDto);

    renderHook(() => useAnalytics(), { wrapper: wrapperAt('/exams') });

    await waitFor(() => expect(startAnalytics).toHaveBeenCalledTimes(1));
    expect(startAnalytics).toHaveBeenCalledWith('phc_example', 'u42', {
      roles: ['admin'],
      status: 'active',
      studentMode: false,
    });
  });

  it('me сменился, пока грузился конфиг — старт всё равно доезжает, один раз', async () => {
    authStatus = 'ok';
    authMe = makeMe();
    let resolveFirst: (dto: AnalyticsConfigDto) => void = () => undefined;
    mockedApiFetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue({ posthogKey: 'phc_example' } satisfies AnalyticsConfigDto);

    const { rerender } = renderHook(() => useAnalytics(), {
      wrapper: wrapperAt('/exams'),
    });
    // applyMe после сохранения профиля — новый объект того же человека.
    authMe = makeMe({ status: 'active' });
    rerender();
    resolveFirst({ posthogKey: 'phc_example' });

    await waitFor(() => expect(startAnalytics).toHaveBeenCalledTimes(1));
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
  });

  it('me сменился после старта — конфиг не запрашивается повторно', async () => {
    authStatus = 'ok';
    authMe = makeMe();
    mockedApiFetch.mockResolvedValue({
      posthogKey: 'phc_example',
    } satisfies AnalyticsConfigDto);

    const { rerender } = renderHook(() => useAnalytics(), {
      wrapper: wrapperAt('/exams'),
    });
    await waitFor(() => expect(startAnalytics).toHaveBeenCalledTimes(1));
    authMe = makeMe();
    rerender();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('путь /join/x — syncRecording вызывается с ним', async () => {
    authStatus = 'ok';
    authMe = makeMe();
    mockedApiFetch.mockResolvedValue({
      posthogKey: 'phc_example',
    } satisfies AnalyticsConfigDto);

    renderHook(() => useAnalytics(), { wrapper: wrapperAt('/join/x') });

    await waitFor(() => expect(startAnalytics).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(syncRecording).toHaveBeenCalledWith('/join/x'));
  });

  it('переход ok → guest — reset()', async () => {
    authStatus = 'ok';
    authMe = makeMe();
    mockedApiFetch.mockResolvedValue({
      posthogKey: 'phc_example',
    } satisfies AnalyticsConfigDto);

    const { rerender } = renderHook(() => useAnalytics(), {
      wrapper: wrapperAt('/exams'),
    });
    await waitFor(() => expect(startAnalytics).toHaveBeenCalledTimes(1));

    authStatus = 'guest';
    authMe = null;
    rerender();

    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
  });

  it('сеть/ошибка запроса — тихо, без падения и без старта клиента', async () => {
    authStatus = 'ok';
    authMe = makeMe();
    mockedApiFetch.mockRejectedValue(new Error('сеть недоступна'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderHook(() => useAnalytics(), { wrapper: wrapperAt('/exams') });

    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(startAnalytics).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
