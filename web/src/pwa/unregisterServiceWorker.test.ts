// Тест снятия старого SW (ADR-0032). jsdom не реализует serviceWorker/caches —
// оба подставляются фейками на globalThis на время теста и убираются в afterEach,
// чтобы не протекать в соседние тестовые файлы.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { unregisterServiceWorker } from './unregisterServiceWorker';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unregisterServiceWorker', () => {
  it('снимает все регистрации и стирает все кеши', async () => {
    const unregisterA = vi.fn(() => Promise.resolve(true));
    const unregisterB = vi.fn(() => Promise.resolve(true));
    const getRegistrations = vi.fn(() =>
      Promise.resolve([{ unregister: unregisterA }, { unregister: unregisterB }]),
    );
    const deleteCache = vi.fn(() => Promise.resolve(true));
    const keys = vi.fn(() => Promise.resolve(['workbox-precache-v1', 'workbox-runtime']));

    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } });
    vi.stubGlobal('caches', { keys, delete: deleteCache });

    await unregisterServiceWorker();

    expect(getRegistrations).toHaveBeenCalled();
    expect(unregisterA).toHaveBeenCalled();
    expect(unregisterB).toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v1');
    expect(deleteCache).toHaveBeenCalledWith('workbox-runtime');
  });

  it('не падает, если в браузере нет serviceWorker/caches', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('caches', undefined);

    await expect(unregisterServiceWorker()).resolves.toBeUndefined();
  });

  it('не падает при отказе браузера снять регистрацию', async () => {
    const getRegistrations = vi.fn(() =>
      Promise.reject(new Error('снятие регистрации недоступно')),
    );

    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } });
    vi.stubGlobal('caches', { keys: vi.fn(() => Promise.resolve([])), delete: vi.fn() });

    await expect(unregisterServiceWorker()).resolves.toBeUndefined();
  });
});
