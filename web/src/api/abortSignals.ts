// Комбинирует несколько AbortSignal в один сигнал (аудит 2026-09-21, H/MED):
// apiFetch (http.ts) обрывает fetch и своим таймером (API_TIMEOUT_MS), и
// signal-ом вызывающего — оба должны уметь оборвать один и тот же запрос.
// AbortSignal.any — стандартный способ, но появился в браузерах только в
// 2024 (Safari 17.4); часть учеников открывает кабинет со старого iPhone, и
// на нём метода нет — свой фолбэк обязателен, а не опциональное улучшение.
export function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);

  const controller = new AbortController();

  // Один из входных сигналов уже отменён к моменту вызова (например, внешний
  // signal пришёл уже истёкшим) — combined обязан родиться отменённым, а не
  // ждать следующего 'abort', которого не будет.
  const alreadyAborted = signals.find((s) => s.aborted);
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason);
    return controller.signal;
  }

  function onAbort(event: Event): void {
    // Слушатели снимаются сразу после первого срабатывания — иначе они
    // висели бы на всех входных сигналах до их собственной сборки мусора.
    for (const s of signals) s.removeEventListener('abort', onAbort);
    controller.abort((event.target as AbortSignal).reason);
  }

  for (const s of signals) s.addEventListener('abort', onAbort);

  return controller.signal;
}
