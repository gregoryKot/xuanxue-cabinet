// Одна загрузка файла частями, как обещание (ADR-0189): кнопка «Перегнать видео»
// заводит новое видео за каждым перегоном и ждёт его конца, а не рисует полосу.
// Тот же прогон, что у формы (videoUploadRunner.ts) — порядок «старт → части →
// complete», повтор на сбой сети, отпечаток для продолжения; второго загрузчика
// нет. Отвергается отказом сервера (текст сервера) и отменой (`AbortError`).
import type { VideoCodec } from '@xuanxue/shared';
import { captureVideoPoster } from './captureVideoPoster';
import { runVideoUpload } from './videoUploadRunner';
import type { VideoUploadTransport } from './videoUploadTypes';

export interface UploadVideoBlobParams<TResult extends object> {
  file: Blob;
  transport: VideoUploadTransport<TResult>;
  signal: AbortSignal;
  /** Пауза перед повтором (useUploadPause.ts). */
  waitForResume: (delaySec: number) => Promise<void>;
  /** Кодек файла для `complete`, если известен. */
  codec?: VideoCodec;
}

export function uploadVideoBlob<TResult extends object>(
  params: UploadVideoBlobParams<TResult>,
): Promise<TResult> {
  const { file, transport, signal, waitForResume, codec } = params;
  return new Promise<TResult>((resolve, reject) => {
    void runVideoUpload({
      file,
      transport,
      signal,
      codec,
      waitForResume,
      isCancelled: () => signal.aborted,
      onProgress: () => undefined,
      capturePoster: () => captureVideoPoster(file, { signal }),
      onFailed: (error) => reject(new Error(error.message)),
      onDone: resolve,
    }).then(
      // Прогон молча выходит при отмене, не вызывая ни onDone, ни onFailed:
      // промис иначе остался бы висеть. К уже решённому промису это ничего не меняет.
      () => reject(new DOMException('Загрузка отменена.', 'AbortError')),
      reject,
    );
  });
}
