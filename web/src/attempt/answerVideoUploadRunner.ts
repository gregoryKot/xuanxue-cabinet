// Один сквозной прогон загрузки видео-ответа (ADR-0137): старт → части по
// одной → complete, с повтором на сетевой сбой/занятость сервера и
// остановкой на отказе сервера. Не React — вынесено из useAnswerVideoUpload.ts
// (файловый лимит, CLAUDE.md «Храповики»), переиспользуется хуком через
// колбэки, тестируется без DOM.
import type { ExamMediaDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { UPLOAD_TIMEOUT_MS } from '../api/http';
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  answerVideoRetryDelaySeconds,
  classifyAnswerVideoError,
  computeAnswerVideoFingerprint,
  nextMissingAnswerVideoPart,
  sliceAnswerVideoPart,
} from './answerVideoUpload';

const UPLOAD_FAILED_MESSAGE = 'Не удалось загрузить видео. Попробуйте ещё раз.';

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
  const fingerprint = computeAnswerVideoFingerprint(file);
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
        timeoutMs: UPLOAD_TIMEOUT_MS,
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

interface WithRetryOptions {
  isCancelled: () => boolean;
  waitForResume: (delaySec: number) => Promise<void>;
  onFailed: (error: FormError) => void;
}

/** Повторяет `step()` на сетевой сбой/занятость сервера (503) с паузой по
 * расписанию (answerVideoRetryDelaySeconds); отказ сервера (4xx) —
 * `onFailed` и стоп. `undefined` — шаг не завершился успехом (отказ или
 * отмена снаружи), вызывающий обязан выйти. */
async function withRetry<T>(
  step: () => Promise<T>,
  options: WithRetryOptions,
): Promise<T | undefined> {
  const { isCancelled, waitForResume, onFailed } = options;
  let attempt = 1;
  for (;;) {
    if (isCancelled()) return undefined;
    try {
      return await step();
    } catch (err) {
      if (isCancelled()) return undefined;
      const classified = classifyAnswerVideoError(err);
      if (classified.kind === 'stop') {
        onFailed(errorFrom(err, UPLOAD_FAILED_MESSAGE));
        return undefined;
      }
      await waitForResume(
        answerVideoRetryDelaySeconds(attempt, classified.retryAfterSec),
      );
      if (isCancelled()) return undefined;
      attempt += 1;
    }
  }
}
