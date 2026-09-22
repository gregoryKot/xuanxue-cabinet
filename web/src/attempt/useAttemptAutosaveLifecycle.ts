// Слушатели браузерного жизненного цикла для автосохранения — вынесено из
// useAttemptAutosave.ts (храповик размера файлов, CLAUDE.md «Храповики»).
// Возврат сети (`online`, телефон в метро), закрытие вкладки (`pagehide`) и
// уход в фон (`visibilitychange` → hidden, где pagehide на телефоне не
// успевает) — все три ведут в один и тот же flush(): он сам ничего не шлёт,
// если сохранять нечего (useAttemptSaveRunner.ts). Провал здесь не критичен
// — статус уже 'error', следующая правка или новый `online` подхватят сами
// (в отличие от flush() перед submit в AttemptInProgress.tsx, где сбой
// обязан остановить отправку).
import { useEffect } from 'react';

export function useAttemptAutosaveLifecycle(flush: () => Promise<void>): void {
  useEffect(() => {
    const run = () => {
      flush().catch(() => {
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
