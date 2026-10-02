// Слушатели браузерного жизненного цикла для автосохранения — вынесено из
// useAttemptAutosave.ts (храповик размера файлов, CLAUDE.md «Храповики»).
// Возврат сети (`online`, телефон в метро), закрытие вкладки (`pagehide`) и
// уход в фон (`visibilitychange` → hidden, где pagehide на телефоне не
// успевает) — все три ведут в один и тот же flush(): он сам ничего не шлёт,
// если сохранять нечего (useAttemptSaveRunner.ts). Провал здесь не критичен
// — статус уже 'error', следующая правка или новый `online` подхватят сами
// (в отличие от flush() перед submit в AttemptInProgress.tsx, где сбой
// обязан остановить отправку).
//
// `keepalive` (аудит 2026-10-01, F43): страница выгружается, и обычный fetch
// браузер обрывает вместе с ней — PATCH с последним ответом не доходил, а
// localStorage-черновик не спасал того, кто до дедлайна попытку больше не
// открыл. Только здесь: дебаунс, повтор и flush перед submit идут как раньше.
import { useEffect } from 'react';
import type { AttemptFlushOptions } from './useAttemptSaveRunner';

export function useAttemptAutosaveLifecycle(
  flush: (options?: AttemptFlushOptions) => Promise<void>,
): void {
  useEffect(() => {
    const run = () => {
      flush({ keepalive: true }).catch(() => {
        /* фоновая попытка — сбой уже виден в status, повторять здесь нечем */
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') run();
    };
    window.addEventListener('online', run);
    window.addEventListener('pagehide', run);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', run);
      window.removeEventListener('pagehide', run);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flush]);
}
