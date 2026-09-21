// Юнит-тесты возможностей браузера (ADR-0092, ПР №5) — отдельно от
// pushSectionState.ts: здесь только сами предикаты, без порядка их вызова.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { iosNeedsHomeScreenInstall, isPushBrowserSupported } from './webPushEnvironment';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPushBrowserSupported', () => {
  it('serviceWorker + PushManager + Notification есть — true', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('PushManager', {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(isPushBrowserSupported()).toBe(true);
  });

  it('нет navigator.serviceWorker — false', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('PushManager', {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(isPushBrowserSupported()).toBe(false);
  });

  it('нет window.PushManager — false', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(isPushBrowserSupported()).toBe(false);
  });

  it('нет глобального Notification — false (иначе чтение .permission кинуло бы ReferenceError)', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('PushManager', {});

    expect(isPushBrowserSupported()).toBe(false);
  });
});

describe('iosNeedsHomeScreenInstall', () => {
  it('не iPhone — false, даже без standalone-режима', () => {
    vi.stubGlobal('navigator', { userAgent: DESKTOP_UA });
    stubMatchMedia(false);

    expect(iosNeedsHomeScreenInstall()).toBe(false);
  });

  it('iPhone, standalone нет ни по одному признаку — true', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA });
    stubMatchMedia(false);

    expect(iosNeedsHomeScreenInstall()).toBe(true);
  });

  it('iPhone, display-mode: standalone (современный признак) — false', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA });
    stubMatchMedia(true);

    expect(iosNeedsHomeScreenInstall()).toBe(false);
  });

  it('iPhone, navigator.standalone (старый Safari), display-mode не совпал — false', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA, standalone: true });
    stubMatchMedia(false);

    expect(iosNeedsHomeScreenInstall()).toBe(false);
  });
});
