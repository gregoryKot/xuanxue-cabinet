// Перехват `beforeinstallprompt` (docs/PWA.md) — модульная переменная, не
// состояние хука: Chrome Android шлёт событие один раз, как только кабинет
// становится «устанавливаемым», и это может случиться до того, как
// useInstallPrompt.ts вообще смонтируется (первый экран после входа не
// обязан быть «/install» или AppShell с InstallAppCard). `captureInstallPrompt`
// зовётся один раз в main.tsx рядом с registerServiceWorker — событие ловится
// на уровне приложения, а не отдельного компонента; хук читает готовое
// значение через useSyncExternalStore (тот же приём, что и у
// app/NewVersionBanner.tsx с api/appVersion.ts).
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let capturedEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Регистрирует хуки на `beforeinstallprompt`/`appinstalled` — зовётся один
 * раз при старте приложения (main.tsx). */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    capturedEvent = event as BeforeInstallPromptEvent;
    notify();
  });

  // Установка могла пройти и без нажатия нашей кнопки (меню браузера) —
  // событие больше не годится, кнопка обязана пропасть.
  window.addEventListener('appinstalled', () => {
    capturedEvent = null;
    notify();
  });
}

export function getInstallPromptEvent(): BeforeInstallPromptEvent | null {
  return capturedEvent;
}

/** Сбрасывает пойманное событие — `prompt()` вызывается только один раз за
 * событие (браузер требует новое `beforeinstallprompt` на повтор). */
export function clearInstallPromptEvent(): void {
  capturedEvent = null;
  notify();
}

export function subscribeToInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
