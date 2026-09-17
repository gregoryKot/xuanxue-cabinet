// Фоновый прогрев чанков кабинета: когда сессия уже подтверждена и первый
// экран нарисован, остальные разделы можно скачать заранее — переход между
// ними перестаёт ждать сети (на проде TTFB 0.5–1.1 с, измерение 2026-09-15).
//
// По одному чанку за раз и только в простое браузера (`requestIdleCallback`,
// в Safari его нет — фолбэк на `setTimeout`): прогрев не должен отнимать
// канал у данных первого экрана, которые грузятся прямо сейчас.
import { useEffect } from 'react';
import { ROUTE_MODULES } from './routeModules';

/** Safari без requestIdleCallback: пауза, за которую первый экран успевает ожить. */
const IDLE_FALLBACK_DELAY_MS = 300;

type Cancel = () => void;

function scheduleWhenIdle(task: () => void): Cancel {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => task());
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, IDLE_FALLBACK_DELAY_MS);
  return () => window.clearTimeout(id);
}

/** Прогревает экраны кабинета, пока `enabled` — сессия подтверждена и роль известна. */
export function usePrefetchRoutes(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const queue = Object.values(ROUTE_MODULES).filter((route) => route.warm);
    let cancelled = false;

    const loadNext = (): void => {
      const next = queue.shift();
      if (cancelled || !next) return;
      void next
        .load()
        // Не догрузился (офлайн, старый деплой) — не повод бросать очередь:
        // этот экран всё равно загрузится при переходе на него.
        .catch(() => null)
        .then(() => {
          if (!cancelled) cancelScheduled = scheduleWhenIdle(loadNext);
        });
    };

    // Объявлено после loadNext, но до первого его вызова: loadNext читает
    // переменную в момент выполнения, а не объявления.
    let cancelScheduled: Cancel = scheduleWhenIdle(loadNext);
    return () => {
      cancelled = true;
      cancelScheduled();
    };
  }, [enabled]);
}
