// Один сквозной прогон загрузки видео (ADR-0137, ADR-0165): отпечаток →
// старт → части по одной → завершение, с повтором на сетевой сбой/занятость
// сервера и остановкой на отказе сервера. Не React и не знает маршрутов:
// сеть — транспорт вида видео (videoUploadTypes.ts). Переиспользуется
// хуком через колбэки (useVideoUpload.ts), тестируется без DOM.
import type { FormError } from '../components/FormServerError';
import { computeVideoFingerprint } from './videoFingerprint';
import { nextMissingVideoPart, sliceVideoPart } from './videoUploadParts';
import { withRetry } from './videoUploadRetry';
import type {
  VideoUploadProgressUpdate,
  VideoUploadSession,
  VideoUploadTransport,
} from './videoUploadTypes';

// Файл не читается (iOS убрал временную копию из «Фото», нет прав): без
// отпечатка загрузку не начать, а тихо зависнуть в «Загружаем» — худший исход.
const FILE_UNREADABLE_MESSAGE = 'Не удалось прочитать файл. Выберите его ещё раз.';

// Часть в 8 МиБ на слабом аплинке (сотни КБ/с с телефона за городом) не
// укладывается в общие 120 с UPLOAD_TIMEOUT_MS — повтор шёл бесконечно и
// никогда не долетал (аудит 2026-10-01, F15). 10 минут хватает от ~14 КБ/с;
// обрыв живого соединения всё равно ловится сетевой ошибкой раньше.
const VIDEO_PART_TIMEOUT_MS = 10 * 60_000;

export interface RunVideoUploadParams<TResult extends object> {
  file: Blob;
  transport: VideoUploadTransport<TResult>;
  signal: AbortSignal;
  /** Выше уже отменили или переиграли загрузку (новый `selectFile`) — шаг
   * обязан выйти молча, не трогая состояние устаревшим результатом. */
  isCancelled: () => boolean;
  onProgress: (progress: VideoUploadProgressUpdate) => void;
  /** Пауза перед повтором — прерывается «Продолжить сейчас», online-событием
   * или отменой (useVideoUpload.ts). */
  waitForResume: (delaySec: number) => Promise<void>;
  onFailed: (error: FormError) => void;
  onDone: (result: TResult) => void;
}

function toProgress(session: VideoUploadSession): VideoUploadProgressUpdate {
  return {
    sentParts: session.receivedParts.length,
    partCount: session.partCount,
    partBytes: session.partBytes,
  };
}

export async function runVideoUpload<TResult extends object>(
  params: RunVideoUploadParams<TResult>,
): Promise<void> {
  const { file, transport, signal, isCancelled, onProgress, waitForResume } = params;
  const { onFailed, onDone } = params;
  const fingerprint = await computeVideoFingerprint(file).catch(() => null);
  if (isCancelled()) return;
  if (fingerprint === null) {
    onFailed({ message: FILE_UNREADABLE_MESSAGE });
    return;
  }
  const retry = <T>(step: () => Promise<T>) =>
    withRetry(step, { isCancelled, waitForResume, onFailed });

  const upload = await retry(() =>
    transport.start({ sizeBytes: file.size, fingerprint }, { signal }),
  );
  if (!upload || isCancelled()) return;
  onProgress(toProgress(upload));

  let current = upload;
  let next = nextMissingVideoPart(current.partCount, current.receivedParts);
  while (next !== null) {
    if (isCancelled()) return;
    const partNumber = next;
    const blob = sliceVideoPart(file, partNumber, current.partBytes);
    const updated = await retry(() =>
      transport.uploadPart(current.id, partNumber, blob, {
        signal,
        timeoutMs: VIDEO_PART_TIMEOUT_MS,
      }),
    );
    if (!updated || isCancelled()) return;
    current = updated;
    onProgress(toProgress(current));
    next = nextMissingVideoPart(current.partCount, current.receivedParts);
  }

  const result = await retry(() => transport.complete(current.id, { signal }));
  if (!result || isCancelled()) return;
  onDone(result);
}
