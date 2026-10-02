// Повтор шага загрузки видео-ответа на сетевой сбой и занятость сервера —
// вынесено из answerVideoUploadRunner.ts (файловый лимит, CLAUDE.md
// «Храповики»): сам прогон остался про порядок шагов, а политика «когда
// повторять, когда остановиться» живёт отдельно и тестируется через него.
import { errorFrom, type FormError } from '../components/FormServerError';
import {
  answerVideoRetryDelaySeconds,
  classifyAnswerVideoError,
} from './answerVideoUpload';

const UPLOAD_FAILED_MESSAGE = 'Не удалось загрузить видео. Попробуйте ещё раз.';

export interface WithRetryOptions {
  isCancelled: () => boolean;
  waitForResume: (delaySec: number) => Promise<void>;
  onFailed: (error: FormError) => void;
}

/** Повторяет `step()` на сетевой сбой/занятость сервера (503) с паузой по
 * расписанию (answerVideoRetryDelaySeconds); отказ сервера (4xx) —
 * `onFailed` и стоп. `undefined` — шаг не завершился успехом (отказ или
 * отмена снаружи), вызывающий обязан выйти. */
export async function withRetry<T>(
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
