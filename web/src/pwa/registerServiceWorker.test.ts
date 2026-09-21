// Тест регистрации push-worker (ADR-0092). jsdom не реализует
// navigator.serviceWorker — подставляется фейком на время теста, по
// образцу удалённого unregisterServiceWorker.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './registerServiceWorker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerServiceWorker', () => {
  it('регистрирует /sw.js, когда serviceWorker доступен', async () => {
    const register = vi.fn(() => Promise.resolve({}));
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await registerServiceWorker();

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('не падает, если в браузере нет serviceWorker', async () => {
    vi.stubGlobal('navigator', {});

    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it('не падает при отказе register()', async () => {
    const register = vi.fn(() => Promise.reject(new Error('регистрация недоступна')));
    vi.stubGlobal('navigator', { serviceWorker: { register } });

    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });
});
