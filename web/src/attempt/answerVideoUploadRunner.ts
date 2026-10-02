// Один сквозной прогон загрузки видео-ответа (ADR-0137): старт → части по
// одной → complete, с повтором на сетевой сбой/занятость сервера и
// остановкой на отказе сервера. Не React — вынесено из useAnswerVideoUpload.ts
// (файловый лимит, CLAUDE.md «Храповики»), переиспользуется хуком через
// колбэки, тестируется без DOM.
import type { ExamMediaDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import type { FormError } from '../components/FormServerError';
import { computeAnswerVideoFingerprint } from './answerVideoFingerprint';
import { withRetry } from './answerVideoRetry';
import { nextMissingAnswerVideoPart, sliceAnswerVideoPart } from './answerVideoUpload';

// Файл не читается (iOS убрал временную копию из «Фото», нет прав): без
// отпечатка загрузку не начать, а тихо зависнуть в «Загружаем» — худший исход.
const FILE_UNREADABLE_MESSAGE = 'Не удалось прочитать файл. Выберите его ещё раз.';

export interface AnswerVideoUploadProgress {
  sentParts: number;
  partCount: number;
  partBytes: number;
}

export interface RunAnswerVideoUploadParams {
  attemptId: string;
  itemId: string;
  file: File;
  signal: AbortSignal;
  /** Выше уже отменили или переиграли загрузку (новый `selectFile`) — шаг
   * обязан выйти молча, не трогая состояние устаревшим результатом. */
  isCancelled: () => boolean;
  onProgress: (progress: AnswerVideoUploadProgress) => void;
  /** Пауза перед повтором — прерывается «Продолжить сейчас», online-событием
   * или отменой (useAnswerVideoUpload.ts). */
  waitForResume: (delaySec: number) => Promise<void>;
  onFailed: (error: FormError) => void;
  onDone: (media: ExamMediaDto) => void;
}

// Часть в 8 МиБ на слабом аплинке (сотни КБ/с с телефона за городом) не
// укладывается в общие 120 с UPLOAD_TIMEOUT_MS — повтор шёл бесконечно и
// никогда не долетал (аудит 2026-10-01, F15). 10 минут хватает от ~14 КБ/с;
// обрыв живого соединения всё равно ловится сетевой ошибкой раньше.
const ANSWER_VIDEO_PART_TIMEOUT_MS = 10 * 60_000;

export async function runAnswerVideoUpload(
  params: RunAnswerVideoUploadParams,
): Promise<void> {
  const {
    attemptId,
    itemId,
    file,
    signal,
    isCancelled,
    onProgress,
    waitForResume,
    onFailed,
    onDone,
  } = params;
  const fingerprint = await computeAnswerVideoFingerprint(file).catch(() => null);
  if (isCancelled()) return;
  if (fingerprint === null) {
    onFailed({ message: FILE_UNREADABLE_MESSAGE });
    return;
  }
  const retry = <T>(step: () => Promise<T>) =>
    withRetry(step, { isCancelled, waitForResume, onFailed });

  const upload = await retry(() =>
    apiRoute('POST /attempts/:id/answer-video', {
      params: { id: attemptId },
      body: { itemId, sizeBytes: file.size, fingerprint },
      signal,
    }),
  );
  if (!upload || isCancelled()) return;
  onProgress({
    sentParts: upload.receivedParts.length,
    partCount: upload.partCount,
    partBytes: upload.partBytes,
  });

  let current = upload;
  let next = nextMissingAnswerVideoPart(current.partCount, current.receivedParts);
  while (next !== null) {
    if (isCancelled()) return;
    const partNumber = next;
    const blob = sliceAnswerVideoPart(file, partNumber, current.partBytes);
    const updated = await retry(() =>
      apiRoute('PUT /answer-videos/:id/parts/:n', {
        params: { id: current.id, n: String(partNumber) },
        body: blob,
        signal,
        timeoutMs: ANSWER_VIDEO_PART_TIMEOUT_MS,
      }),
    );
    if (!updated || isCancelled()) return;
    current = updated;
    onProgress({
      sentParts: current.receivedParts.length,
      partCount: current.partCount,
      partBytes: current.partBytes,
    });
    next = nextMissingAnswerVideoPart(current.partCount, current.receivedParts);
  }

  const media = await retry(() =>
    apiRoute('POST /answer-videos/:id/complete', {
      params: { id: current.id },
      signal,
    }),
  );
  if (!media || isCancelled()) return;
  onDone(media);
}
