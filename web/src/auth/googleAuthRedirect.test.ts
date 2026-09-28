// Адрес входа через Google собираем сами (googleAuthRedirect.ts) — проверяем
// путь, query-параметр приглашения и что переход уводит текущую вкладку, не
// открывает новую (тот же приём, что telegramAuthRedirect.test.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleLoginStartUrl, redirectToGoogleAuth } from './googleAuthRedirect';

afterEach(() => {
  vi.unstubAllGlobals();
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
