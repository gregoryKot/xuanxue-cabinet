// Общий предел ожидания для промиса браузера, который нечем отменить — в
// отличие от fetch (там таймаут через AbortSignal, api/http.ts:API_TIMEOUT_MS),
// у serviceWorker.ready/pushManager.subscribe()/getSubscription()/unsubscribe()
// нет signal. Раньше таймаут для serviceWorker.ready был одной копией
// «гонка + settled-флаг» внутри pwa/serviceWorkerReady.ts — второй, третьей и
// четвёртой копии для subscribe/getSubscription/unsubscribe не появляется,
// обе используют этот общий helper (баг с прода 2026-09-22, CLAUDE.md «Одна
// механика — один компонент», гейт jscpd).
//
// Не Promise.race([promise, timeout]) напрямую: race не снимает проигравший
// таймер — он всё равно тикнет и попробует резолвить/отклонить уже улаженный
// промис снаружи (никакого вреда самому race, но лишний таймер живёт до
// собственного срабатывания). Более важная причина — обратный случай:
// исходный промис (который нечем отменить, он выполняется в браузере
// независимо от нас) может прилететь ПОСЛЕ того, как таймаут уже отдал
// ошибку вызывающему коду. Флаг `settled` закрывает оба пути: первый
// сработавший — резолв или отказ — побеждает, а второй просто отбрасывается,
// не вызывая `resolve`/`reject` повторно и не давая позднему ответу
// перезаписать уже показанную пользователю ошибку.
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new TimeoutError(message));
    }, ms);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (reason: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // reason не типизирован как Error (промис браузера может отклониться
        // чем угодно) — приводим к Error явно, иначе прокидывать чужой отказ
        // как есть не даёт @typescript-eslint/prefer-promise-reject-errors.
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      },
    );
  });
}
