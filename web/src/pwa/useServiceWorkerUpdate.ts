// Регистрация service worker и состояние для тоста обновления (ADR-0006,
// CLAUDE.md «Приложение на телефоне»): `registerType: 'prompt'` в
// web/vite.config.ts — новый SW не подхватывает управление сам, ждёт
// нажатия «Обновить» в UpdateToast.tsx.
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface ServiceWorkerUpdateState {
  /** Пришла новая версия — SW установлен и ждёт активации. */
  needRefresh: boolean;
  /** Оболочка приложения закеширована — работает офлайн. */
  offlineReady: boolean;
  /** Активировать новую версию (кнопка «Обновить»): страница перезагрузится. */
  update: () => Promise<void>;
  /** Закрыть тост, не обновляясь (кнопка «Позже»). */
  dismiss: () => void;
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdateState {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const updateSwRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    // В vitest (MODE === 'test') реальную регистрацию не запускаем: setupTests.ts
    // вне зоны этой задачи, поэтому гейт — здесь. Собственный тест хука
    // переопределяет MODE через vi.stubEnv, чтобы проверить колбэки.
    if (import.meta.env.MODE === 'test') return;

    updateSwRef.current = registerSW({
      immediate: true,
      onNeedRefresh: () => setNeedRefresh(true),
      onOfflineReady: () => setOfflineReady(true),
      onRegisterError: (error: unknown) => {
        // Единственное разрешённое место console.* во фронтенде (CLAUDE.md,
        // «Обработка ошибок»): без офлайн-кеша и обновлений приложение всё
        // равно работает, пользователю ничего не показываем.
        console.error('Не удалось зарегистрировать service worker:', error);
      },
    });
  }, []);

  const update = useCallback(async () => {
    await updateSwRef.current?.(true);
  }, []);

  const dismiss = useCallback(() => {
    setNeedRefresh(false);
    setOfflineReady(false);
  }, []);

  return { needRefresh, offlineReady, update, dismiss };
}
