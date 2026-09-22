// Тесты push-worker (web/public/sw.js, ADR-0092). Файл не имеет импортов и
// только вешает слушателей на `self` (см. шапку sw.js), поэтому здесь
// подменяется глобальный `self` фейком, собирающим слушателей в
// beforeAll, а `fetch`/`caches` подменяются под каждый сценарий отдельно —
// слушатели читают их из глобальной области при каждом вызове, а не
// один раз при импорте, поэтому повторный импорт модуля между тестами не
// нужен. Детерминизм: без setTimeout, без реальной сети (vi.stubGlobal).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type SwEventType = 'install' | 'activate' | 'push' | 'notificationclick';
type Listener = (event: Record<string, unknown>) => void;

const listeners: Partial<Record<SwEventType, Listener>> = {};

/** Слушатель обязан быть зарегистрирован к этому моменту (beforeAll ниже
 * уже импортировал sw.js) — отсутствие означает, что файл не повесил
 * обработчик на self, это баг worker'а, а не теста, поэтому падаем громко,
 * а не молча зовём undefined (noUncheckedIndexedAccess, CLAUDE.md). */
function getListener(type: SwEventType): Listener {
  const listener = listeners[type];
  if (!listener) throw new Error(`sw.js не зарегистрировал обработчик "${type}"`);
  return listener;
}

const fakeSelf = {
  addEventListener: (type: SwEventType, handler: Listener) => {
    listeners[type] = handler;
  },
  skipWaiting: vi.fn(),
  clients: {
    claim: vi.fn(() => Promise.resolve()),
    matchAll: vi.fn(() => Promise.resolve<unknown[]>([])),
    openWindow: vi.fn(() => Promise.resolve(null)),
  },
  registration: {
    showNotification: vi.fn(() => Promise.resolve(undefined)),
    unregister: vi.fn(() => Promise.resolve(true)),
  },
};

/** event.waitUntil в реальном SW держит воркер живым — в тесте достаточно
 * дождаться переданного промиса, чтобы дальше проверять моки. */
function withWaitUntil(extra: Record<string, unknown> = {}) {
  let captured: unknown;
  const event = { ...extra, waitUntil: (p: unknown) => (captured = p) };
  return { event, settle: () => Promise.resolve(captured) };
}

function stubInboxResponse(items: Array<{ text: string; readAt?: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) })),
  );
}

beforeAll(async () => {
  // self стоит на время импорта, чтобы addEventListener() из шапки файла
  // отработал по фейку, а не по self из jsdom.
  vi.stubGlobal('self', fakeSelf);
  // @ts-expect-error — обычный .js вне src/ без allowJs: деклараций для
  // него нет и не будет, файл не участвует в сборке TS (см. шапку sw.js).
  await import('../../public/sw.js');
});

beforeEach(() => {
  // afterEach снимает все стабы разом (включая self) — возвращаем его перед
  // каждым тестом; сами слушатели уже захвачены в beforeAll и читают self
  // заново при каждом вызове (см. шапку файла).
  vi.stubGlobal('self', fakeSelf);
  fakeSelf.skipWaiting.mockClear();
  fakeSelf.clients.claim.mockClear();
  fakeSelf.clients.matchAll.mockReset().mockResolvedValue([]);
  fakeSelf.clients.openWindow.mockClear();
  fakeSelf.registration.showNotification.mockClear();
  fakeSelf.registration.unregister.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('install', () => {
  it('сразу забирает управление — self.skipWaiting()', () => {
    getListener('install')({});

    expect(fakeSelf.skipWaiting).toHaveBeenCalled();
  });
});

describe('activate', () => {
  it('стирает все кеши и НЕ снимает регистрацию (в отличие от килсвитча ADR-0032)', async () => {
    const deleteCache = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('caches', {
      keys: vi.fn(() => Promise.resolve(['workbox-precache-v1', 'workbox-runtime'])),
      delete: deleteCache,
    });

    const { event, settle } = withWaitUntil();
    getListener('activate')(event);
    await settle();

    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v1');
    expect(deleteCache).toHaveBeenCalledWith('workbox-runtime');
    expect(fakeSelf.clients.claim).toHaveBeenCalled();
    // Регресс-проверка ключевого отличия от килсвитча: постоянная
    // регистрация — то, ради чего worker вообще вернули (ADR-0092).
    expect(fakeSelf.registration.unregister).not.toHaveBeenCalled();
  });
});

describe('push', () => {
  it('показывает первую непрочитанную запись, а не первую в списке', async () => {
    stubInboxResponse([
      { text: 'уже прочитано', readAt: '2026-09-20T10:00:00Z' },
      { text: 'первое непрочитанное', readAt: undefined },
      { text: 'второе непрочитанное', readAt: undefined },
    ]);

    const { event, settle } = withWaitUntil();
    getListener('push')(event);
    await settle();

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Школа Сюань-Сюэ',
      expect.objectContaining({ body: 'первое непрочитанное' }),
    );
  });

  it('сеть отказала — запасная строка, а не тишина', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('нет сети'))),
    );

    const { event, settle } = withWaitUntil();
    getListener('push')(event);
    await settle();

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Школа Сюань-Сюэ',
      expect.objectContaining({ body: 'Есть новое уведомление' }),
    );
  });

  it('ответ не 2xx — запасная строка, а не тишина', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })),
    );

    const { event, settle } = withWaitUntil();
    getListener('push')(event);
    await settle();

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Школа Сюань-Сюэ',
      expect.objectContaining({ body: 'Есть новое уведомление' }),
    );
  });

  // Регрессия аудита 2026-09-22: чтение ленты уходило без таймаута. Молчащая
  // сеть (не разрыв, а тишина — обычное дело на телефоне) держала бы
  // event.waitUntil до таймаута платформы, и браузер рисовал бы своё «сайт
  // обновился в фоне» вместо нашего текста. Гейт scripts/check-outbound-timeout.mjs
  // держит это правилом, тест — поведением.
  it('чтение ленты уходит с таймаутом, обрыв по нему — запасная строка', async () => {
    const abort = Object.assign(new Error('The operation was aborted'), {
      name: 'TimeoutError',
    });
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.reject(abort));
    vi.stubGlobal('fetch', fetchMock);

    const { event, settle } = withWaitUntil();
    getListener('push')(event);
    await settle();

    // Разбор вызова, а не expect.any(AbortSignal): матчер отдаёт `any`, и
    // типизированный eslint его не пропускает (no-unsafe-assignment).
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/me/inbox?limit=20');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Школа Сюань-Сюэ',
      expect.objectContaining({ body: 'Есть новое уведомление' }),
    );
  });

  it('непрочитанных нет — запасная строка', async () => {
    stubInboxResponse([
      { text: 'старое, уже прочитано', readAt: '2026-09-20T10:00:00Z' },
    ]);

    const { event, settle } = withWaitUntil();
    getListener('push')(event);
    await settle();

    expect(fakeSelf.registration.showNotification).toHaveBeenCalledWith(
      'Школа Сюань-Сюэ',
      expect.objectContaining({ body: 'Есть новое уведомление' }),
    );
  });
});

describe('notificationclick', () => {
  it('закрывает уведомление и уводит открытую вкладку на /notifications', async () => {
    const close = vi.fn();
    const focus = vi.fn(() => Promise.resolve());
    const navigate = vi.fn((url: string) => Promise.resolve({ url, focus }));
    fakeSelf.clients.matchAll.mockResolvedValue([{ navigate, focus }]);

    const { event, settle } = withWaitUntil({ notification: { close } });
    getListener('notificationclick')(event);
    await settle();

    expect(close).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/notifications');
    expect(focus).toHaveBeenCalled();
  });

  it('без открытой вкладки — открывает новое окно на /notifications', async () => {
    fakeSelf.clients.matchAll.mockResolvedValue([]);

    const { event, settle } = withWaitUntil({ notification: { close: vi.fn() } });
    getListener('notificationclick')(event);
    await settle();

    expect(fakeSelf.clients.openWindow).toHaveBeenCalledWith('/notifications');
  });
});
