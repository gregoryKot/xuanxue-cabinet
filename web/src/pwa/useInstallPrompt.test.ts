// Тест хука над модульным перехватом beforeinstallprompt
// (installPromptCapture.ts) — состояние живёт в closure модуля, как у
// api/appVersion.ts, поэтому каждый тест берёт свежий модуль через
// vi.resetModules() + динамический import() (тот же приём, что
// app/NewVersionBanner.test.tsx).
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as CaptureModule from './installPromptCapture';
import type { useInstallPrompt as useInstallPromptType } from './useInstallPrompt';

let captureInstallPrompt: typeof CaptureModule.captureInstallPrompt;
let useInstallPrompt: typeof useInstallPromptType;

beforeEach(async () => {
  vi.resetModules();
  ({ captureInstallPrompt } = await import('./installPromptCapture'));
  ({ useInstallPrompt } = await import('./useInstallPrompt'));
});

function dispatchBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  return event;
}

describe('useInstallPrompt', () => {
  it('событие не пришло — canPrompt false', () => {
    captureInstallPrompt();
    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.canPrompt).toBe(false);
  });

  it('promptInstall без пойманного события — ничего не делает, не бросает', async () => {
    captureInstallPrompt();
    const { result } = renderHook(() => useInstallPrompt());

    await expect(
      act(async () => result.current.promptInstall()),
    ).resolves.toBeUndefined();
  });

  it('beforeinstallprompt пришёл до монтирования хука — canPrompt всё равно true', () => {
    captureInstallPrompt();
    // Перехват модульный — событие ловится ещё до рендера хука, как в
    // реальном приложении (main.tsx зовёт captureInstallPrompt раньше
    // первого рендера).
    dispatchBeforeInstallPrompt();

    const { result } = renderHook(() => useInstallPrompt());

    expect(result.current.canPrompt).toBe(true);
  });

  it('promptInstall вызывает event.prompt(), ждёт userChoice и сбрасывает событие', async () => {
    captureInstallPrompt();
    const event = dispatchBeforeInstallPrompt();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canPrompt).toBe(true);

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.canPrompt).toBe(false));
  });

  it('appinstalled сбрасывает событие — canPrompt становится false', async () => {
    captureInstallPrompt();
    dispatchBeforeInstallPrompt();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.canPrompt).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    await waitFor(() => expect(result.current.canPrompt).toBe(false));
  });
});
