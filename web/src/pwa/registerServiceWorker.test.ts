// Тест регистрации push-worker (ADR-0092). jsdom не реализует
// navigator.serviceWorker — подставляется фейком на время теста, по
// образцу удалённого unregisterServiceWorker.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerServiceWorker', () => {
  it('регистрирует /sw.js, когда serviceWorker доступен, — отдаёт true', async () => {
    const register = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await expect(registerServiceWorker()).resolves.toBe(true);

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('не падает, если в браузере нет serviceWorker, — отдаёт false', async () => {
    vi.stubGlobal('navigator', {});

    await expect(registerServiceWorker()).resolves.toBe(false);
  });

  it('не падает при отказе register() — отдаёт false, а не тишину (баг с прода 2026-09-22)', async () => {
    const register = vi.fn(() => Promise.reject(new Error('регистрация недоступна')));
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await expect(registerServiceWorker()).resolves.toBe(false);
  });
});
