// Возврат к вкладке перечитывает сессию (вход по письму завершился в другой
// вкладке). Сеть — по пути запроса (mockApiByPath); число обращений к
// /auth/me считаем по вызовам мока.
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { AuthProvider } from './AuthProvider';
import { useSessionRecheckOnReturn } from './useSessionRecheckOnReturn';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
});

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function meCalls(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/me').length;
}

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

/** Монтирует хук и ждёт стартовый /auth/me провайдера — дальше считаем только
 * обращения, вызванные возвратом к вкладке. */
async function mountSettled(enabled: boolean) {
  mockApiByPath({ '/auth/me': new ApiError('Войдите', 401, 'unauthorized') });
  const view = renderHook(() => useSessionRecheckOnReturn(enabled), { wrapper });
  await waitFor(() => expect(meCalls()).toBe(1));
  return view;
}

describe('useSessionRecheckOnReturn', () => {
  it('включён: фокус окна перечитывает сессию', async () => {
    await mountSettled(true);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(meCalls()).toBe(2));
  });

  it('включён: видимая вкладка перечитывает, скрытая — нет', async () => {
    await mountSettled(true);

    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(meCalls()).toBe(1);

    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(meCalls()).toBe(2));
  });

  it('выключен: ни фокус, ни видимость сессию не перечитывают', async () => {
    await mountSettled(false);

    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(meCalls()).toBe(1);
  });

  it('после размонтирования слушатели сняты', async () => {
    const { unmount } = await mountSettled(true);
    unmount();

    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(meCalls()).toBe(1);
  });
});
