// Тест хука регистрации SW (ADR-0006). MODE в vitest всегда 'test' — хук
// намеренно пропускает реальную регистрацию в этом режиме (см. комментарий в
// useServiceWorkerUpdate.ts), поэтому здесь MODE подменяется на 'production'
// через vi.stubEnv, а virtual:pwa-register — мок, чтобы не трогать настоящий
// service worker.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

interface CapturedRegisterOptions {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegisterError?: (error: unknown) => void;
}

const updateServiceWorkerMock = vi.fn(async (_reloadPage?: boolean) => {});
let captured: CapturedRegisterOptions = {};

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: CapturedRegisterOptions) => {
    captured = options;
    return updateServiceWorkerMock;
  },
}));

describe('useServiceWorkerUpdate', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'production');
    updateServiceWorkerMock.mockClear();
    captured = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('регистрирует SW с immediate:true и стартовым пустым состоянием', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());

    expect(captured.immediate).toBe(true);
    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
  });

  it('onNeedRefresh и onOfflineReady переключают состояние', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());

    act(() => captured.onNeedRefresh?.());
    expect(result.current.needRefresh).toBe(true);

    act(() => captured.onOfflineReady?.());
    expect(result.current.offlineReady).toBe(true);
  });

  it('update() вызывает функцию, возвращённую registerSW, с true', async () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await result.current.update();
    });

    expect(updateServiceWorkerMock).toHaveBeenCalledWith(true);
  });

  it('dismiss() сбрасывает needRefresh и offlineReady', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());

    act(() => {
      captured.onNeedRefresh?.();
      captured.onOfflineReady?.();
    });
    expect(result.current.needRefresh).toBe(true);
    expect(result.current.offlineReady).toBe(true);

    act(() => result.current.dismiss());

    expect(result.current.needRefresh).toBe(false);
    expect(result.current.offlineReady).toBe(false);
  });

  it('ошибка регистрации уходит в console.error, а не теряется молча', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHook(() => useServiceWorkerUpdate());
    const failure = new Error('workbox insta-fail');

    act(() => captured.onRegisterError?.(failure));

    expect(errorSpy).toHaveBeenCalledWith(
      'Не удалось зарегистрировать service worker:',
      failure,
    );
    errorSpy.mockRestore();
  });

  it('в реальном тестовом MODE регистрацию не запускает', () => {
    vi.unstubAllEnvs(); // вернуть MODE='test', как в обычном прогоне vitest

    renderHook(() => useServiceWorkerUpdate());

    expect(captured).toEqual({});
  });
});
