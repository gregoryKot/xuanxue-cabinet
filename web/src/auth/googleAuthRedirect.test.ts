// Вход через Google (googleAuthRedirect.ts) — проверяем, что переход уводит
// текущую вкладку, а не открывает новую, и несёт код приглашения (тот же приём,
// что telegramAuthRedirect.test.ts). Сам сборщик адреса — loginStartUrl.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleLinkStartUrl,
  redirectToGoogleAuth,
  redirectToGoogleLink,
} from './googleAuthRedirect';
import { consumeReturnTo } from './returnTo';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('redirectToGoogleAuth', () => {
  it('уводит текущую вкладку на адрес старта, а не открывает новую', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    redirectToGoogleAuth('a'.repeat(32));

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(`/api/auth/google/start?join=${'a'.repeat(32)}`);
  });

  it('без кода приглашения — тот же путь без query', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    redirectToGoogleAuth();

    expect(assign).toHaveBeenCalledWith('/api/auth/google/start');
  });
});

describe('googleLinkStartUrl', () => {
  it('тот же путь старта, с intent=link', () => {
    expect(googleLinkStartUrl()).toBe('/api/auth/google/start?intent=link');
  });
});

describe('redirectToGoogleLink', () => {
  it('сохраняет /profile для возврата и уводит вкладку на адрес привязки', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });

    redirectToGoogleLink();

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/api/auth/google/start?intent=link');
    // consumeReturnTo — тем же способом, что returnTo.test.ts: путь пережил
    // «переход» и читается страницей возврата (postLoginPath).
    expect(consumeReturnTo()).toBe('/profile');
  });
});
