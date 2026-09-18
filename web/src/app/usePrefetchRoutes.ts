// Фоновый прогрев чанков кабинета: когда сессия уже подтверждена и первый
// экран нарисован, остальные разделы можно скачать заранее — переход между
// ними перестаёт ждать сети (на проде TTFB 0.5–1.1 с, измерение 2026-09-15).
// У ученика греются его два экрана («Задания», «Занятия»), у штата —
// разделы штата: греть чужой роли экраны — трафик мимо того, что человек
// вообще может открыть (решение владельца, docs/PLAN.md §11).
//
// По одному чанку за раз и только в простое браузера (`requestIdleCallback`,
// в Safari его нет — фолбэк на `setTimeout`): прогрев не должен отнимать
// канал у данных первого экрана, которые грузятся прямо сейчас.
import { useEffect } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { ROUTE_MODULES, type RouteModule } from './routeModules';
import { isTeacher } from './screenAccess';

/** Safari без requestIdleCallback: пауза, за которую первый экран успевает ожить. */
const IDLE_FALLBACK_DELAY_MS = 300;

// Ключи ROUTE_MODULES, отданные ученику — всё остальное с `warm: true` греет
// штат (см. шапку файла).
const STUDENT_ROUTE_KEYS = new Set(['tasks', 'studentLessons']);

type Cancel = () => void;

function scheduleWhenIdle(task: () => void): Cancel {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => task());
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, IDLE_FALLBACK_DELAY_MS);
  return () => window.clearTimeout(id);
}

/** Экраны, которые стоит прогреть для этой роли — свои, не чужие (см. шапку
 * файла). Сессия ещё не известна (`me === null`) — греть нечего. */
function routesToWarm(me: MeDto | null): RouteModule[] {
  if (!me) return [];
  const staff = isTeacher(me);
  return Object.entries(ROUTE_MODULES)
    .filter(([key, route]) => route.warm && STUDENT_ROUTE_KEYS.has(key) !== staff)
    .map(([, route]) => route);
}

/** Прогревает экраны кабинета этой роли, пока сессия известна. */
export function usePrefetchRoutes(me: MeDto | null): void {
  useEffect(() => {
    const queue = routesToWarm(me);
    if (queue.length === 0) return;
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
  }, [me]);
}
