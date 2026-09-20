// Тест обёртки над React.lazy на случай сбоя загрузки чанка после деплоя
// (ADR-0071, комментарий-«почему» — в lazyRoute.ts). reportClientError
// мокается целиком — его собственная отправка проверена в
// errors/reportClientError.test.ts.
import { Component, Suspense, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { lazyRoute as lazyRouteType } from './lazyRoute';
import type { RouteLoader } from './routeModules';

vi.mock('../errors/reportClientError', () => ({ reportClientError: vi.fn() }));

// Ключ приватный (не экспортирован из lazyRoute.ts — незачем: только этот
// модуль читает и пишет метку) — тест воспроизводит его буквально, как и
// сам lazyRoute.ts.
const CHUNK_RELOAD_KEY = 'xuanxue:chunkReload';

let lazyRoute: typeof lazyRouteType;
let reportClientErrorMock: ReturnType<typeof vi.fn>;
let reloadMock: ReturnType<typeof vi.fn>;
let originalLocation: Location;

// jsdom не даёт заспайить window.location.reload напрямую (свойство не
// переопределяется) — подменяем весь объект, тот же рецепт, что в
// components/ErrorBoundary.test.tsx.
beforeEach(async () => {
  vi.resetModules();
  const module = await import('../errors/reportClientError');
  // vi.mock создаёт мок один раз на файл — resetModules освежает только
  // lazyRoute.ts; без явного mockClear его история звонков утекала бы
  // между тестами (см. тот же приём в reportClientError.test.ts).
  reportClientErrorMock = vi.mocked(module.reportClientError);
  reportClientErrorMock.mockClear();
  ({ lazyRoute } = await import('./lazyRoute'));

  reloadMock = vi.fn();
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, reload: reloadMock },
    configurable: true,
    writable: true,
  });

  sessionStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    configurable: true,
    writable: true,
  });
  sessionStorage.clear();
  vi.restoreAllMocks();
});

/** Граница ошибок минимальнее компонентной ErrorBoundary приложения — той
 * нужен Router (useLocation/useNavigate), а тут важно только не дать
 * повторному провалу чанка уронить тест. */
class TestBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Настоящая поломка модуля — ErrorBoundary приложения сама отправит
    // kind: 'render' (components/ErrorBoundary.tsx), здесь это не проверяем.
  }

  override render(): ReactNode {
    return this.state.hasError ? <p>Сбой</p> : this.props.children;
  }
}

function renderLazy(load: RouteLoader) {
  const LazyScreen = lazyRoute(load);
  return render(
    <TestBoundary>
      <Suspense fallback={<p>Загрузка…</p>}>
        <LazyScreen />
      </Suspense>
    </TestBoundary>,
  );
}

describe('lazyRoute', () => {
  it('успешная загрузка снимает метку и рендерит экран', async () => {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    function Screen() {
      return <p>Экран</p>;
    }

    renderLazy(() => Promise.resolve({ default: Screen }));

    expect(await screen.findByText('Экран')).toBeInTheDocument();
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });

  it('первый провал — отчёт kind: chunk и одна перезагрузка страницы', async () => {
    reportClientErrorMock.mockResolvedValue(undefined);

    renderLazy(() => Promise.reject(new Error('чанк не найден')));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    expect(reportClientErrorMock).toHaveBeenCalledWith('chunk', expect.any(Error));
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
  });

  // Приватный режим Safari бросает на доступе к sessionStorage (тот же
  // сценарий, что в auth/returnTo.test.ts) — hasChunkReloadFlag должен
  // считать это «метки нет», а не ронять загрузку экрана.
  it('sessionStorage недоступен — всё равно шлёт отчёт и перезагружает', async () => {
    reportClientErrorMock.mockResolvedValue(undefined);
    const originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('приватный режим: доступ запрещён');
      },
    });

    renderLazy(() => Promise.reject(new Error('чанк не найден')));

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    expect(reportClientErrorMock).toHaveBeenCalledWith('chunk', expect.any(Error));

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage,
    });
  });

  it('второй провал подряд (метка уже стоит) — без отчёта и без перезагрузки', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');

    renderLazy(() => Promise.reject(new Error('снова не найден')));

    // Ошибке некуда уйти, кроме TestBoundary (как в реальном дереве — до
    // components/ErrorBoundary.tsx): дожидаемся именно этого, а не таймаута.
    expect(await screen.findByText('Сбой')).toBeInTheDocument();
    expect(reportClientErrorMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
