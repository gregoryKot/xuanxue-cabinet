// Расшифровка списка попыток, где один битый документ — одна пропущенная
// строка с error-логом, а не 500 на весь ответ (F55, аудит 2026-10-01:
// попытка, зашифрованная другим ключом или с испорченным blobом, роняла
// очередь учителя целиком). Не молча: attemptId в логе — по нему ищут в
// Railway (CLAUDE.md «Логи»). Одиночная `decryptAttempt` (exam-attempt.mapper.ts)
// по-прежнему бросает — там один документ и есть весь ответ.
import { Logger } from '@nestjs/common';
import type { Types } from 'mongoose';
import { errorMessage } from '../common/error-info';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';

const logger = new Logger('decryptAttempt');

/** Одна строка лога на пропущенную попытку: тот же логгер и формат у всех
 * путей (список, тик закрытия, курсор статистики) — искать в Railway одно. */
export function logBrokenAttempt(attemptId: Types.ObjectId | string, err: unknown): void {
  logger.error(
    `exam.attempt.decrypt: попытка ${attemptId.toString()} пропущена: ${errorMessage(err)}`,
  );
}

export function decryptAttemptOrNull(doc: RawLeanExamAttempt): LeanExamAttempt | null {
  try {
    return decryptAttempt(doc);
  } catch (err) {
    logBrokenAttempt(doc._id, err);
    return null;
  }
}

export function decryptAttemptsSkippingBroken(
  docs: RawLeanExamAttempt[],
): LeanExamAttempt[] {
  return docs.flatMap((doc) => {
    const attempt = decryptAttemptOrNull(doc);
    return attempt ? [attempt] : [];
  });
}
