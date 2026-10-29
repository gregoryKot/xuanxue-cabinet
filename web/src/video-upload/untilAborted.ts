// Ограничение «до отмены» для шагов, которые сами отменять не умеют (декодер и
// чтение байт библиотеки): снимок кадра (captureVideoPoster.ts, ADR-0182) и
// чтение кодека (probeVideoCodec.ts, ADR-0189).

/** Промис отказывает, когда сигнал отменён, — на нём «ограничиваем по времени»
 * шаги, которые сами отменять не умеют (декодер библиотеки). Брошенный шаг
 * доработает в фоне и сам освободит ресурсы в своём `finally`. */
export function untilAborted<T>(step: Promise<T>, signal: AbortSignal): Promise<T> {
  // Брошенный шаг может отказать уже после нас — его поздний отказ никому не
  // нужен и не должен остаться необработанным.
  step.catch(() => undefined);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('чтение видео прервано'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    step
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}
