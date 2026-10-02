// Расшифровка списка попыток, где один битый документ — одна пропущенная
// строка с error-логом, а не 500 на весь ответ (F55, аудит 2026-10-01:
// попытка, зашифрованная другим ключом или с испорченным blobом, роняла
// очередь учителя целиком). Не молча: attemptId в логе — по нему ищут в
// Railway (CLAUDE.md «Логи»). Одиночная `decryptAttempt` (exam-attempt.mapper.ts)
// по-прежнему бросает — там один документ и есть весь ответ.
import { Logger } from '@nestjs/common';
import { errorMessage } from '../common/error-info';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';

const logger = new Logger('decryptAttempt');

export function decryptAttemptOrNull(doc: RawLeanExamAttempt): LeanExamAttempt | null {
  try {
    return decryptAttempt(doc);
  } catch (err) {
    logger.error(
      `exam.attempt.decrypt: попытка ${doc._id.toString()} пропущена: ${errorMessage(err)}`,
    );
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
