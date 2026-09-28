// Юнит-тесты предикатов установки (docs/PWA.md) — приём подмены глобалей тот
// же, что у notifications/webPushEnvironment.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectInstallPlatform,
  isAndroid,
  isIPhone,
  isStandalone,
  shouldOfferInstall,
} from './installEnvironment';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
}

function stubNavigator(userAgent: string, standalone?: boolean) {
  vi.stubGlobal('navigator', { userAgent, standalone });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isIPhone', () => {
  it('iPhone — true', () => {
    stubNavigator(IPHONE_UA);
    expect(isIPhone()).toBe(true);
  });

  it('десктоп — false', () => {
    stubNavigator(DESKTOP_UA);
    expect(isIPhone()).toBe(false);
  });
});

describe('isAndroid', () => {
  it('Android — true', () => {
    stubNavigator(ANDROID_UA);
    expect(isAndroid()).toBe(true);
  });

  it('iPhone — false', () => {
    stubNavigator(IPHONE_UA);
    expect(isAndroid()).toBe(false);
  });

  it('десктоп — false', () => {
    stubNavigator(DESKTOP_UA);
    expect(isAndroid()).toBe(false);
  });
});

describe('isStandalone', () => {
  it('display-mode: standalone — true', () => {
    stubNavigator(IPHONE_UA);
    stubMatchMedia(true);
    expect(isStandalone()).toBe(true);
  });

  it('navigator.standalone (старый Safari) — true', () => {
    stubNavigator(IPHONE_UA, true);
    stubMatchMedia(false);
    expect(isStandalone()).toBe(true);
  });

  it('ни один признак — false', () => {
    stubNavigator(IPHONE_UA);
    stubMatchMedia(false);
    expect(isStandalone()).toBe(false);
  });
});

describe('detectInstallPlatform', () => {
  it('iPhone — ios', () => {
    stubNavigator(IPHONE_UA);
    stubMatchMedia(false);
    expect(detectInstallPlatform()).toBe('ios');
  });

  it('Android — android', () => {
    stubNavigator(ANDROID_UA);
    stubMatchMedia(false);
    expect(detectInstallPlatform()).toBe('android');
  });

  it('остальное — desktop', () => {
    stubNavigator(DESKTOP_UA);
    stubMatchMedia(false);
    expect(detectInstallPlatform()).toBe('desktop');
  });
});

describe('shouldOfferInstall', () => {
  it('iPhone, не standalone — true', () => {
    stubNavigator(IPHONE_UA);
    stubMatchMedia(false);
    expect(shouldOfferInstall()).toBe(true);
  });

  it('iPhone, standalone — false, уже стоит', () => {
    stubNavigator(IPHONE_UA);
    stubMatchMedia(true);
    expect(shouldOfferInstall()).toBe(false);
  });

  it('Android, не standalone — true', () => {
    stubNavigator(ANDROID_UA);
    stubMatchMedia(false);
    expect(shouldOfferInstall()).toBe(true);
  });

  it('десктоп — false, ставить некуда', () => {
    stubNavigator(DESKTOP_UA);
    stubMatchMedia(false);
    expect(shouldOfferInstall()).toBe(false);
  });
});
