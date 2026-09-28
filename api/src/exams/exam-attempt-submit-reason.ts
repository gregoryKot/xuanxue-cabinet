// Отказ «Сдать» при пропущенном объяснении (ADR-0146, ТЗ 4.4 доп.) —
// отдельным файлом от exam-attempts.service.ts (CLAUDE.md «Файлы»: сервис
// уже на границе лимита размера). Зовёт submit() ExamAttemptsService,
// авто-закрытие по дедлайну (closeIfExpiredAttempt) этот файл не трогает —
// правило CLAUDE.md/ТЗ явно про явную сдачу, время должно закрывать попытку
// без исключений.
import { findMissingReasonNumbers, formatMissingReasonMessage } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { LeanExamAttempt } from './exam-attempt.mapper';

export function assertReasonsGiven(attempt: LeanExamAttempt): void {
  const numbers = findMissingReasonNumbers(attempt.blocks, attempt.answers);
  if (numbers.length > 0) {
    throw new InvalidInputError(formatMissingReasonMessage(numbers));
  }
}
