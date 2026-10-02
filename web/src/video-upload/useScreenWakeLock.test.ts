// Блокировка сна на фейке (test-support/fakeWakeLock.ts): jsdom не знает
// Screen Wake Lock. Ждём микрозадачи через `act(async)`, таймеров нет.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  installFakeWakeLock,
  removeFakeWakeLockAfterEach,
} from '../test-support/fakeWakeLock';
import { useScreenWakeLock } from './useScreenWakeLock';

removeFakeWakeLockAfterEach();

/** Даёт отработать цепочке `request().then(...)` внутри эффекта. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useScreenWakeLock', () => {
  it('пока загрузка идёт — просит блокировку экрана один раз', async () => {
    const wakeLock = installFakeWakeLock();

    renderHook(() => useScreenWakeLock(true));
    await flush();

    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(wakeLock.request).toHaveBeenCalledWith('screen');
    expect(wakeLock.sentinels[0]?.released).toBe(false);
  });

  it('без загрузки — не просит', async () => {
    const wakeLock = installFakeWakeLock();

    renderHook(() => useScreenWakeLock(false));
    await flush();

    expect(wakeLock.request).not.toHaveBeenCalled();
  });

  it('загрузка кончилась — блокировка снята', async () => {
    const wakeLock = installFakeWakeLock();
    const { rerender } = renderHook(({ active }) => useScreenWakeLock(active), {
      initialProps: { active: true },
    });
    await flush();

    rerender({ active: false });

    expect(wakeLock.sentinels[0]?.released).toBe(true);
  });

  it('размонтирование снимает блокировку', async () => {
    const wakeLock = installFakeWakeLock();
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await flush();

    unmount();

    expect(wakeLock.sentinels[0]?.released).toBe(true);
  });

  it('страница вернулась из фона, загрузка идёт — просит заново', async () => {
    const wakeLock = installFakeWakeLock();
    renderHook(() => useScreenWakeLock(true));
    await flush();

    act(() => wakeLock.hide());
    expect(wakeLock.sentinels[0]?.released).toBe(true);
    // В фоне запрос отказал бы сам — не просим.
    await flush();
    expect(wakeLock.request).toHaveBeenCalledTimes(1);

    act(() => wakeLock.show());
    await flush();

    expect(wakeLock.request).toHaveBeenCalledTimes(2);
    expect(wakeLock.sentinels[1]?.released).toBe(false);
  });

  it('пока блокировка держится, возврат на вкладку второй не просит', async () => {
    const wakeLock = installFakeWakeLock();
    renderHook(() => useScreenWakeLock(true));
    await flush();

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();

    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('пока запрос в пути, второй не уходит', async () => {
    const wakeLock = installFakeWakeLock();
    renderHook(() => useScreenWakeLock(true));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();

    expect(wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('загрузка кончилась, пока шёл запрос, — полученная блокировка сразу снята', async () => {
    const wakeLock = installFakeWakeLock();
    const { unmount } = renderHook(() => useScreenWakeLock(true));

    unmount();
    await flush();

    expect(wakeLock.sentinels[0]?.released).toBe(true);
  });

  it('браузера без wakeLock нет — ничего не делает и не падает', async () => {
    installFakeWakeLock();
    Reflect.deleteProperty(navigator, 'wakeLock');

    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await flush();

    expect(() => unmount()).not.toThrow();
  });

  it('отказ запроса (экономия батареи) проглочен, после возврата пробуем снова', async () => {
    const wakeLock = installFakeWakeLock({ requestError: new Error('NotAllowedError') });
    renderHook(() => useScreenWakeLock(true));
    await flush();

    act(() => wakeLock.show());
    await flush();

    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it('ошибка при снятии блокировки проглочена: и на размонтировании, и на позднем ответе', async () => {
    const wakeLock = installFakeWakeLock({ releaseError: new Error('уже снята') });
    const held = renderHook(() => useScreenWakeLock(true));
    await flush();
    const late = renderHook(() => useScreenWakeLock(true));

    expect(() => held.unmount()).not.toThrow();
    expect(() => late.unmount()).not.toThrow();
    await flush();

    expect(wakeLock.sentinels.every((sentinel) => sentinel.released)).toBe(true);
  });
});
