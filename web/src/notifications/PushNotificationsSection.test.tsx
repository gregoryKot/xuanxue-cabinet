// Каждое состояние раздела — свой тест на то, что видит человек (ADR-0092,
// ПР №5, ТЗ п.2 и п.6): переходы и тело запроса уже проверены на уровне хука
// (usePushSubscription.test.ts), здесь — заголовок, текст объяснения и какая
// кнопка есть или её нет.
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { arrayBufferToBase64Url } from './pushSubscriptionCodec';
import { PushNotificationsSection } from './PushNotificationsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const PUBLIC_KEY = arrayBufferToBase64Url(new TextEncoder().encode('vapid-key').buffer);

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

function stubSupportedBrowser({
  userAgent = DESKTOP_UA,
  permission,
  getSubscriptionResult = null,
  subscribeResult,
}: {
  userAgent?: string;
  permission: NotificationPermission;
  getSubscriptionResult?: unknown;
  subscribeResult?: unknown;
}) {
  const requestPermission = vi.fn(() => Promise.resolve(permission));
  vi.stubGlobal('navigator', {
    userAgent,
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          subscribe: vi.fn(() => Promise.resolve(subscribeResult)),
          getSubscription: vi.fn(() => Promise.resolve(getSubscriptionResult)),
        },
      }),
    },
  });
  stubMatchMedia(false);
  vi.stubGlobal('PushManager', {});
  vi.stubGlobal('Notification', { permission, requestPermission });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PushNotificationsSection — раздела нет вовсе', () => {
  it('push выключен на сервере (publicKey: null) — ничего не рендерит', async () => {
    mockApiByPath({ '/push/public-key': { publicKey: null } });
    const { container } = render(<PushNotificationsSection />);

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Push-уведомления')).not.toBeInTheDocument();
  });

  it('браузер не умеет push — ничего не рендерит', async () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_UA });
    stubMatchMedia(false);
    mockApiByPath({ '/push/public-key': { publicKey: PUBLIC_KEY } });

    const { container } = render(<PushNotificationsSection />);

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PushNotificationsSection — загрузка', () => {
  it('пока состояние не известно — скелетон, не пустота и не заголовок раньше времени', async () => {
    let resolveFetch!: (value: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => (resolveFetch = resolve)),
    );
    const { container } = render(<PushNotificationsSection />);

    expect(screen.queryByText('Push-уведомления')).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();

    resolveFetch({ publicKey: null });
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('PushNotificationsSection — iPhone без установки на «Домой»', () => {
  it('объяснение про экран «Домой», кнопки нет', async () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA });
    stubMatchMedia(false);
    mockApiByPath({ '/push/public-key': { publicKey: PUBLIC_KEY } });

    render(<PushNotificationsSection />);

    expect(await screen.findByText('Push-уведомления')).toBeInTheDocument();
    expect(
      screen.getByText(/На iPhone уведомления работают только у кабинета/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PushNotificationsSection — разрешение не спрашивали', () => {
  it('объяснение, предупреждение про «Запретить» и кнопка включения — и она подписывает', async () => {
    const subscription = {
      endpoint: 'https://push.example/one',
      getKey: () => new TextEncoder().encode('key-bytes').buffer,
    };
    stubSupportedBrowser({ permission: 'granted', subscribeResult: subscription });
    // Notification.permission на момент загрузки — 'default': requestPermission
    // (тот же мок) резолвит уже 'granted', как в реальном браузере после клика.
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    });
    mockApiByPath({
      '/push/public-key': { publicKey: PUBLIC_KEY },
      '/me/push-subscriptions': { id: '1', endpoint: subscription.endpoint },
    });

    render(<PushNotificationsSection />);

    expect(await screen.findByText('Push-уведомления')).toBeInTheDocument();
    expect(
      screen.getByText(/покажут то же, что отмечено в списке выше/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Нажмёте «Запретить» в окне браузера/)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Включить уведомления' });
    button.click();

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenLastCalledWith(
        '/me/push-subscriptions',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText('Уведомления на этом устройстве включены.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Выключить уведомления' }),
    ).toBeInTheDocument();
  });
});

describe('PushNotificationsSection — запрещено', () => {
  it('объясняет, что заблокировал браузер, кнопки нет вовсе', async () => {
    stubSupportedBrowser({ permission: 'denied' });
    mockApiByPath({ '/push/public-key': { publicKey: PUBLIC_KEY } });

    render(<PushNotificationsSection />);

    expect(
      await screen.findByText(/Браузер заблокировал уведомления для кабинета/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('PushNotificationsSection — разрешено и подписан', () => {
  it('статус «включены» и кнопка выключения — она зовёт и браузерную отписку, и DELETE', async () => {
    const unsubscribe = vi.fn(() => Promise.resolve(true));
    stubSupportedBrowser({
      permission: 'granted',
      getSubscriptionResult: { endpoint: 'https://push.example/two', unsubscribe },
    });
    mockApiByPath({
      '/push/public-key': { publicKey: PUBLIC_KEY },
      '/me/push-subscriptions': undefined,
    });

    render(<PushNotificationsSection />);

    expect(
      await screen.findByText('Уведомления на этом устройстве включены.'),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Выключить уведомления' });
    button.click();

    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/me/push-subscriptions', {
      method: 'DELETE',
      body: { endpoint: 'https://push.example/two' },
    });
    expect(
      await screen.findByRole('button', { name: 'Включить уведомления' }),
    ).toBeInTheDocument();
  });
});

describe('PushNotificationsSection — разрешено, подписки нет', () => {
  it('кнопка включения на месте, разрешение спрашивать повторно не нужно', async () => {
    const requestPermission = vi.fn(() =>
      Promise.resolve('granted' as NotificationPermission),
    );
    stubSupportedBrowser({ permission: 'granted', getSubscriptionResult: null });
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    mockApiByPath({ '/push/public-key': { publicKey: PUBLIC_KEY } });

    render(<PushNotificationsSection />);

    expect(
      await screen.findByRole('button', { name: 'Включить уведомления' }),
    ).toBeInTheDocument();
  });
});

describe('PushNotificationsSection — ошибка загрузки', () => {
  it('баннер с повтором вместо тишины, повтор перечитывает и рисует настоящий раздел', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('сеть недоступна'));

    render(<PushNotificationsSection />);

    expect(await screen.findByText('Push-уведомления')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Не удалось проверить push-уведомления. Попробуйте ещё раз.',
    );
    const retryButton = screen.getByRole('button', { name: 'Попробовать ещё раз' });

    mockApiByPath({ '/push/public-key': { publicKey: null } });
    retryButton.click();

    // publicKey: null после повтора — раздел честно пустеет целиком, баннер
    // ошибки вместе с ним (это и есть «настоящий», не застрявший результат).
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByText('Push-уведомления')).not.toBeInTheDocument();
  });
});

describe('PushNotificationsSection — отказ в разрешении и сбой сети', () => {
  it('запретили в диалоге — на сервер ничего не уходит, показывает объяснение блокировки', async () => {
    stubSupportedBrowser({ permission: 'granted' });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('denied' as NotificationPermission)),
    });
    mockApiByPath({ '/push/public-key': { publicKey: PUBLIC_KEY } });

    render(<PushNotificationsSection />);
    const button = await screen.findByRole('button', { name: 'Включить уведомления' });
    const callsBeforeClick = mockedApiFetch.mock.calls.length;
    button.click();

    expect(
      await screen.findByText(/Браузер заблокировал уведомления для кабинета/),
    ).toBeInTheDocument();
    expect(mockedApiFetch.mock.calls.length).toBe(callsBeforeClick); // ни одного нового запроса
  });

  it('сбой сети при включении — сообщение под кнопкой, не тишина', async () => {
    const subscription = {
      endpoint: 'https://push.example/three',
      getKey: () => new TextEncoder().encode('key-bytes').buffer,
    };
    stubSupportedBrowser({ permission: 'granted', subscribeResult: subscription });
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn(() =>
        Promise.resolve('granted' as NotificationPermission),
      ),
    });
    mockedApiFetch.mockResolvedValueOnce({ publicKey: PUBLIC_KEY });

    render(<PushNotificationsSection />);
    const button = await screen.findByRole('button', { name: 'Включить уведомления' });

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    );
    button.click();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    // Кнопка осталась — можно попробовать ещё раз, ничего не подделано.
    expect(
      screen.getByRole('button', { name: 'Включить уведомления' }),
    ).toBeInTheDocument();
  });
});
