// Тест таймаута ожидания service worker (аудит 2026-09-21, HIGH): без него
// usePushSubscription.ts/pushSectionState.ts зависали бы навсегда, если
// registerServiceWorker.ts не смог зарегистрировать /sw.js. Фейковые
// таймеры вместо настоящего setTimeout (CLAUDE.md «Детерминизм»).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SW_READY_TIMEOUT_MS, waitServiceWorkerReady } from './serviceWorkerReady';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('waitServiceWorkerReady', () => {
  it('serviceWorker.ready резолвится раньше таймаута — отдаёт registration и снимает таймер', async () => {
    const registration = { scope: '/' } as unknown as ServiceWorkerRegistration;
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve(registration) },
    });

    await expect(waitServiceWorkerReady()).resolves.toBe(registration);
    // Таймер снят при резолве — иначе он всё равно тикнет позже и попробует
    // резолвить уже улаженный промис (страховка от утечки таймера).
    expect(vi.getTimerCount()).toBe(0);
  });

  it('serviceWorker.ready не резолвится (регистрация не прошла) — по таймауту null', async () => {
    // Промис нарочно висит вечно — тот самый сценарий из аудита: registerServiceWorker.ts
    // проглотил ошибку, navigator.serviceWorker.ready никогда не резолвится.
    vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } });

    const result = waitServiceWorkerReady(SW_READY_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(SW_READY_TIMEOUT_MS);

    await expect(result).resolves.toBeNull();
  });

  it('запасной таймаут короче SW_READY_TIMEOUT_MS учитывается', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { ready: new Promise(() => {}) } });

    const result = waitServiceWorkerReady(1000);
    await vi.advanceTimersByTimeAsync(999);
    // Ещё не истёк — промис пока не улажен ни на резолв, ни на null.
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBeNull();
  });
});
