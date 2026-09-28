// Хук над модульным перехватом `beforeinstallprompt` (installPromptCapture.ts,
// docs/PWA.md) — только Android/Chrome умеет спросить подтверждение
// программно; iPhone такого события не шлёт никогда, и `canPrompt` там
// всегда false (экран /install тогда показывает шаги руками).
import { useCallback, useSyncExternalStore } from 'react';
import {
  clearInstallPromptEvent,
  getInstallPromptEvent,
  subscribeToInstallPrompt,
} from './installPromptCapture';

interface UseInstallPromptResult {
  canPrompt: boolean;
  promptInstall: () => Promise<void>;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const event = useSyncExternalStore(subscribeToInstallPrompt, getInstallPromptEvent);

  const promptInstall = useCallback(async () => {
    const current = getInstallPromptEvent();
    if (!current) return;
    // Повторно `prompt()` на том же событии браузер не даст — ждём нового
    // `beforeinstallprompt`, а кнопка тем временем пропадает сама. `finally`:
    // упавший `prompt()` иначе оставил бы кнопку, которая уже не сработает.
    try {
      await current.prompt();
      await current.userChoice;
    } finally {
      clearInstallPromptEvent();
    }
  }, []);

  return { canPrompt: event !== null, promptInstall };
}
