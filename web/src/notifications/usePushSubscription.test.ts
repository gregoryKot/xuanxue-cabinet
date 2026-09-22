// Юнит-тест хука без DOM (CLAUDE.md «Тесты») — загрузка состояния и
// механика enable()/disable(): что уходит на сервер, что нет, и как читается
// сбой (ADR-0092, ПР №5, ТЗ п.6). Видимый текст по каждому состоянию —
// PushNotificationsSection.test.tsx; здесь только вызовы и переходы.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { arrayBufferToBase64Url } from './pushSubscriptionCodec';
import { usePushSubscription } from './usePushSubscription';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
// base64UrlToUint8Array (pushSubscriptionCodec.ts) декодирует настоящий
// base64url — у произвольной человекочитаемой строки не та длина (не 0/2/3
// по модулю 4), atob() внутри enable() бросает ещё до subscribe(). Строим
// ключ той же функцией, что и arrayBufferToBase64Url в проде, — форма
// гарантированно верная.
const PUBLIC_KEY = arrayBufferToBase64Url(
  new TextEncoder().encode('fake-vapid-public-key').buffer,
);

/** Браузер, который умеет push целиком — под конкретные permission/подписку.
 * Один и тот же объект `serviceWorker.ready` обслуживает и первичное
 * определение состояния (getSubscription), и enable()/disable() ниже —
 * реальный браузер тоже возвращает одну и ту же регистрацию. */
function stubBrowser({
  permission,
  getSubscriptionResult = null,
  subscribeResult,
}: {
  permission: NotificationPermission;
  getSubscriptionResult?: unknown;
  subscribeResult?: unknown;
}) {
  const subscribe = vi.fn(() => Promise.resolve(subscribeResult));
  const getSubscription = vi.fn(() => Promise.resolve(getSubscriptionResult));
  const requestPermission = vi.fn(() => Promise.resolve(permission));
  vi.stubGlobal('navigator', {
    userAgent: DESKTOP_UA,
    serviceWorker: {
      ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
    },
  });
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal('PushManager', {});
  vi.stubGlobal('Notification', { permission, requestPermission });
  return { subscribe, getSubscription, requestPermission };
}

/** Байты, для которых base64url заранее известен через уже проверенный
 * pushSubscriptionCodec.test.ts — тело POST сверяется с реальным значением,
 * не с самим собой. */
function fakeSubscription(endpoint: string) {
  const p256dh = new TextEncoder().encode('p256dh-bytes').buffer;
  const auth = new TextEncoder().encode('auth-bytes').buffer;
  return {
    endpoint,
    getKey: (name: string) => (name === 'p256dh' ? p256dh : auth),
    expectedBody: {
      endpoint,
      p256dh: arrayBufferToBase64Url(p256dh),
      auth: arrayBufferToBase64Url(auth),
    },
  };
}

afterEach(() => {
  mockedApiFetch.mockReset();
  vi.unstubAllGlobals();
});

describe('usePushSubscription — первичная загрузка', () => {
  it('publicKey: null — состояние hidden, окружение браузера не трогается', async () => {
    mockedApiFetch.mockResolvedValueOnce({ publicKey: null });
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toEqual({ kind: 'hidden' });
    expect(result.current.loadError).toBeNull();
  });

  it('сеть отказала — loadError, а не тишина', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    );
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    expect(result.current.state).toBeNull();
  });

  it('неопознанная ошибка (не ApiError) — общий текст, не текст исключения', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePushSubscription());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe(
      'Не удалось проверить push-уведомления. Попробуйте ещё раз.',
    );
  });
});

describe('usePushSubscription — enable() из default', () => {
  it('разрешили — подписывается и шлёт на сервер верные endpoint/p256dh/auth', async () => {
    const sub = fakeSubscription('https://push.example/a');
    const { subscribe, requestPermission } = stubBrowser({
      permission: 'granted',
      subscribeResult: sub,
    });
    // Notification.permission статичен на момент stubBrowser('granted') —
    // для загрузки в состоянии default нужен отдельный снимок 'default'.
    vi.stubGlobal('Notification', { permission: 'default', requestPermission });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    mockedApiFetch.mockResolvedValueOnce({ id: '1', endpoint: sub.endpoint });
    await act(() => result.current.enable());

    expect(requestPermission).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        // expect.any(...) типизирован как `any` — приводим к Uint8Array, тот
        // же приём, что api/src/channels/telegram.adapter.spec.ts.
        applicationServerKey: expect.any(Uint8Array) as Uint8Array,
      }),
    );
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/me/push-subscriptions', {
      method: 'POST',
      body: sub.expectedBody,
    });
    expect(result.current.state).toEqual({ kind: 'subscribed' });
    expect(result.current.actionError).toBeNull();
  });

  it('запретили — на сервер ничего не уходит, состояние denied', async () => {
    const { subscribe } = stubBrowser({ permission: 'denied' });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('denied')),
    });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    await act(() => result.current.enable());

    expect(subscribe).not.toHaveBeenCalled();
    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только начальный GET ключа
    expect(result.current.state).toEqual({ kind: 'denied' });
  });

  it('диалог закрыли без ответа (permission остался default) — ничего не уходит, кнопка как была', async () => {
    stubBrowser({ permission: 'granted' });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('default')),
    });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    await act(() => result.current.enable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: 'default' });
  });

  it('сбой POST — сообщение под кнопкой, состояние не меняется', async () => {
    const sub = fakeSubscription('https://push.example/b');
    stubBrowser({ permission: 'granted', subscribeResult: sub });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    );
    await act(() => result.current.enable());

    expect(result.current.actionError).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    expect(result.current.state).toEqual({ kind: 'default' });
    expect(result.current.pending).toBe(false);
  });

  it('service worker не зарегистрировался — ready не резолвится, кнопка выходит из pending с честной ошибкой (аудит 2026-09-21)', async () => {
    // registerServiceWorker.ts мог проглотить ошибку регистрации — ready
    // тогда не резолвится никогда. Раньше кнопка «Включить уведомления»
    // висела бы в pending вечно; SW_READY_TIMEOUT_MS должен это оборвать.
    vi.stubGlobal('navigator', {
      userAgent: DESKTOP_UA,
      serviceWorker: { ready: new Promise(() => {}) },
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal('PushManager', {});
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    // Фейковые таймеры — только на сам клик: waitFor выше опирается на
    // настоящий setTimeout для опроса, а advanceTimersByTimeAsync и
    // ожидаемый промис обязаны идти внутри одного act() (иначе react
    // зависает между незавершённым act() и продвижением таймера).
    vi.useFakeTimers();
    await act(async () => {
      const enablePromise = result.current.enable();
      await vi.advanceTimersByTimeAsync(5000);
      await enablePromise;
    });
    vi.useRealTimers();

    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только начальный GET ключа
    expect(result.current.actionError).toBe(
      'Не получилось подключить уведомления. Обновите страницу и попробуйте ещё раз.',
    );
    expect(result.current.pending).toBe(false);
  });

  it('браузер не отдал ключи подписки — честная ошибка, POST не уходит', async () => {
    // getKey() возвращает null — вырожденный случай реального браузера
    // (subscription.getKey('p256dh'|'auth')), а не то, что тестовый фейк
    // подставляет по умолчанию.
    const subWithoutKeys = { endpoint: 'https://push.example/f', getKey: () => null };
    stubBrowser({ permission: 'granted', subscribeResult: subWithoutKeys });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    await act(() => result.current.enable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только начальный GET ключа
    expect(result.current.actionError).toBe(
      'Не удалось включить уведомления. Попробуйте ещё раз.',
    );
    expect(result.current.state).toEqual({ kind: 'default' });
  });
});

describe('usePushSubscription — защита от вызова не в свою очередь', () => {
  it('enable() до того, как загрузка определила состояние, — тихо ничего не делает', async () => {
    // Промис GET /push/public-key нарочно не резолвится — state остаётся
    // null, как в первое мгновение после монтирования.
    mockedApiFetch.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => usePushSubscription());

    await act(() => result.current.enable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только висящий GET, ничего сверх
    expect(result.current.actionError).toBeNull();
  });

  it('enable() из состояния, где кнопки включения не бывает (denied), — тихо ничего не делает', async () => {
    stubBrowser({ permission: 'denied' });
    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'denied' }));

    await act(() => result.current.enable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: 'denied' });
  });

  it('disable() до того, как загрузка определила состояние, — тихо ничего не делает', async () => {
    mockedApiFetch.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => usePushSubscription());

    await act(() => result.current.disable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.actionError).toBeNull();
  });

  it('disable() из состояния, где кнопки выключения не бывает (default), — тихо ничего не делает', async () => {
    stubBrowser({ permission: 'granted' });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(),
    });
    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'default' }));

    await act(() => result.current.disable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toEqual({ kind: 'default' });
  });
});

describe('usePushSubscription — enable() из not-subscribed', () => {
  it('разрешение уже есть — requestPermission не зовётся, подписка идёт сразу', async () => {
    const sub = fakeSubscription('https://push.example/c');
    const { requestPermission, subscribe } = stubBrowser({
      permission: 'granted',
      getSubscriptionResult: null,
      subscribeResult: sub,
    });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'not-subscribed' }));

    mockedApiFetch.mockResolvedValueOnce({ id: '1', endpoint: sub.endpoint });
    await act(() => result.current.enable());

    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(result.current.state).toEqual({ kind: 'subscribed' });
  });
});

describe('usePushSubscription — disable()', () => {
  it('зовёт и браузерную отписку, и DELETE с известным endpoint', async () => {
    const sub = {
      endpoint: 'https://push.example/d',
      unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
    stubBrowser({ permission: 'granted', getSubscriptionResult: sub });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'subscribed' }));

    mockedApiFetch.mockResolvedValueOnce(undefined);
    await act(() => result.current.disable());

    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/me/push-subscriptions', {
      method: 'DELETE',
      body: { endpoint: 'https://push.example/d' },
    });
    expect(result.current.state).toEqual({ kind: 'not-subscribed' });
  });

  it('unsubscribe() браузера бросил неопознанную ошибку — общий текст, DELETE не уходит', async () => {
    const sub = {
      endpoint: 'https://push.example/h',
      unsubscribe: vi.fn(() => Promise.reject(new Error('boom'))),
    };
    stubBrowser({ permission: 'granted', getSubscriptionResult: sub });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'subscribed' }));

    await act(() => result.current.disable());

    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только начальный GET ключа
    expect(result.current.actionError).toBe(
      'Не удалось выключить уведомления. Попробуйте ещё раз.',
    );
    expect(result.current.state).toEqual({ kind: 'subscribed' });
  });

  it('браузер отписал, а сервер отказал — честная ошибка, не тишина', async () => {
    const sub = {
      endpoint: 'https://push.example/e',
      unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
    stubBrowser({ permission: 'granted', getSubscriptionResult: sub });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'subscribed' }));

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    );
    await act(() => result.current.disable());

    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(result.current.actionError).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    // Итог нечестно не подделан: подписка на экране не «пропала» сама.
    expect(result.current.state).toEqual({ kind: 'subscribed' });
  });

  it('service worker не зарегистрировался — ready не резолвится, disable() завершается ошибкой (аудит 2026-09-21)', async () => {
    const sub = {
      endpoint: 'https://push.example/i',
      unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
    stubBrowser({ permission: 'granted', getSubscriptionResult: sub });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'subscribed' }));

    // Между загрузкой раздела и кликом «Выключить» регистрация могла
    // пропасть (второй SW снят браузером, вкладка долго висела открытой) —
    // ready у нового вызова подменяем на вечно висящий промис. Фейковые
    // таймеры — только на сам клик, тем же приёмом, что в enable() выше.
    vi.stubGlobal('navigator', {
      userAgent: DESKTOP_UA,
      serviceWorker: { ready: new Promise(() => {}) },
    });

    vi.useFakeTimers();
    await act(async () => {
      const disablePromise = result.current.disable();
      await vi.advanceTimersByTimeAsync(5000);
      await disablePromise;
    });
    vi.useRealTimers();

    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только начальный GET ключа
    expect(result.current.actionError).toBe(
      'Не получилось подключить уведомления. Обновите страницу и попробуйте ещё раз.',
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.state).toEqual({ kind: 'subscribed' });
  });

  it('подписки в браузере уже нет (редкий рассинхрон) — просто not-subscribed, без лишнего DELETE', async () => {
    const sub = {
      endpoint: 'https://push.example/g',
      unsubscribe: vi.fn(() => Promise.resolve(true)),
    };
    // На загрузке подписка ещё есть (состояние — subscribed, кнопка
    // «Выключить» видна), но к моменту клика getSubscription() уже отдаёт
    // null — та же гонка, что в комментарии у disable() в usePushSubscription.ts.
    const getSubscription = vi
      .fn()
      .mockResolvedValueOnce(sub)
      .mockResolvedValueOnce(null);
    vi.stubGlobal('navigator', {
      userAgent: DESKTOP_UA,
      serviceWorker: {
        ready: Promise.resolve({ pushManager: { getSubscription } }),
      },
    });
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    vi.stubGlobal('PushManager', {});
    vi.stubGlobal('Notification', { permission: 'granted' });

    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });
    const { result } = renderHook(() => usePushSubscription());
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'subscribed' }));

    await act(() => result.current.disable());

    expect(sub.unsubscribe).not.toHaveBeenCalled();
    expect(mockedApiFetch).toHaveBeenCalledTimes(1); // только начальный GET ключа
    expect(result.current.state).toEqual({ kind: 'not-subscribed' });
  });
});
