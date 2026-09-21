// Каждое состояние раздела «Push-уведомления» — по своему тесту (ADR-0092,
// ПР №5, ТЗ п.2: «состояний больше, чем кажется, и каждое надо показать»).
// navigator/window/Notification подменяются через vi.stubGlobal, сети и
// setTimeout нет — детерминизм (CLAUDE.md «Тесты»).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePushSectionState } from './pushSectionState';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

/** Браузер, который умеет push целиком — под конкретные permission/подписку
 * ниже. `PushManager`/`Notification` подменяются явно: jsdom не реализует ни
 * тот, ни другой, поэтому отсутствие подмены — уже тест на «не умеет» (см.
 * describe ниже), а не случайность окружения. */
function stubSupportedBrowser(permission: NotificationPermission, subscription: unknown) {
  vi.stubGlobal('navigator', {
    userAgent: DESKTOP_UA,
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: { getSubscription: () => Promise.resolve(subscription) },
      }),
    },
  });
  stubMatchMedia(false);
  vi.stubGlobal('PushManager', {});
  vi.stubGlobal('Notification', { permission });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolvePushSectionState — push выключен на сервере', () => {
  it('publicKey === null — hidden, окружение браузера не проверяется вовсе', async () => {
    // navigator/window/Notification нарочно не подменены — функция обязана
    // вернуть hidden раньше, чем прочитает хоть один из них.
    await expect(resolvePushSectionState(null)).resolves.toEqual({ kind: 'hidden' });
  });
});

describe('resolvePushSectionState — iPhone без установки на «Домой»', () => {
  it('userAgent iPhone, standalone нет ни по matchMedia, ни по navigator.standalone — ios-install', async () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA, standalone: false });
    stubMatchMedia(false);

    await expect(resolvePushSectionState('key')).resolves.toEqual({
      kind: 'ios-install',
    });
  });

  it('iPhone и display-mode: standalone — это не ios-install, дальше идёт обычная проверка браузера', async () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA });
    stubMatchMedia(true);

    // PushManager/Notification не подменены — следующая по порядку ветка
    // после iOS-проверки честно даёт hidden, не ios-install.
    await expect(resolvePushSectionState('key')).resolves.toEqual({ kind: 'hidden' });
  });
});

describe('resolvePushSectionState — браузер не умеет push', () => {
  it('нет navigator.serviceWorker — hidden', async () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_UA });
    stubMatchMedia(false);
    vi.stubGlobal('PushManager', {});
    vi.stubGlobal('Notification', { permission: 'default' });

    await expect(resolvePushSectionState('key')).resolves.toEqual({ kind: 'hidden' });
  });

  it('нет window.PushManager — hidden', async () => {
    vi.stubGlobal('navigator', {
      userAgent: DESKTOP_UA,
      serviceWorker: { ready: Promise.resolve({}) },
    });
    stubMatchMedia(false);

    await expect(resolvePushSectionState('key')).resolves.toEqual({ kind: 'hidden' });
  });
});

describe('resolvePushSectionState — разрешение не спрашивали', () => {
  it('Notification.permission === "default" — default', async () => {
    stubSupportedBrowser('default', null);

    await expect(resolvePushSectionState('key')).resolves.toEqual({ kind: 'default' });
  });
});

describe('resolvePushSectionState — запрещено', () => {
  it('Notification.permission === "denied" — denied, подписка не проверяется', async () => {
    stubSupportedBrowser('denied', null);

    await expect(resolvePushSectionState('key')).resolves.toEqual({ kind: 'denied' });
  });
});

describe('resolvePushSectionState — разрешено', () => {
  it('подписка этого браузера на сервере есть — subscribed', async () => {
    stubSupportedBrowser('granted', { endpoint: 'https://push.example/1' });

    await expect(resolvePushSectionState('key')).resolves.toEqual({ kind: 'subscribed' });
  });

  it('подписки нет (новое устройство, счищенные данные сайта) — not-subscribed', async () => {
    stubSupportedBrowser('granted', null);

    await expect(resolvePushSectionState('key')).resolves.toEqual({
      kind: 'not-subscribed',
    });
  });
});
