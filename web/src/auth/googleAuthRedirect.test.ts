// Адрес входа через Google собираем сами (googleAuthRedirect.ts) — проверяем
// путь, query-параметр приглашения и что переход уводит текущую вкладку, не
// открывает новую (тот же приём, что telegramAuthRedirect.test.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  googleLinkStartUrl,
  googleLoginStartUrl,
  redirectToGoogleAuth,
  redirectToGoogleLink,
} from './googleAuthRedirect';
import { consumeReturnTo } from './returnTo';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('googleLoginStartUrl', () => {
  it('без кода приглашения — путь без query', () => {
    expect(googleLoginStartUrl()).toBe('/api/auth/google/start');
  });

  it('с кодом приглашения — join в query, кодированный', () => {
    const url = googleLoginStartUrl('a'.repeat(32));
    expect(url).toBe(`/api/auth/google/start?join=${'a'.repeat(32)}`);
  });

  it('код с символами, которые нужно кодировать', () => {
    const url = googleLoginStartUrl('код с пробелом');
    expect(new URL(url, 'https://xuanxue.su').searchParams.get('join')).toBe(
      'код с пробелом',
    );
  });
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
