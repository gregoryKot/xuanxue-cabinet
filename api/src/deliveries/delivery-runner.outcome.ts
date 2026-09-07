// Что записать в delivery по результату адаптера — чистая логика без Mongo
// и DI (CLAUDE.md «Тесты»): повтор через 2 и 10 минут (ADR-0004), после —
// финальный failed с флагом «уведомить учителя».
import type { DateTime } from 'luxon';
import { DELIVERY_RETRY_DELAYS_MIN } from '@xuanxue/shared';
import type { SendResult } from '../channels/channel-adapter';

export type DeliveryOutcome =
  | { readonly status: 'sent'; readonly sentAt: Date; readonly externalId?: string }
  | { readonly status: 'manual' }
  // Раннер вернёт статус в 'pending', не оставит 'sending' — следующий тик
  // подбирает через nextAttemptAt, не через зависший захват.
  | {
      readonly status: 'pending';
      readonly attempts: number;
      readonly nextAttemptAt: Date;
      readonly error: string;
    }
  | {
      readonly status: 'failed';
      readonly attempts: number;
      readonly error: string;
      readonly notifyTeacher: true;
    };

/**
 * `attemptsBefore` — счётчик до этой попытки; после N-й неудачи повтор берёт
 * `DELIVERY_RETRY_DELAYS_MIN[N - 1]` (индексация с первой неудачи), а когда
 * индекс выходит за пределы массива (или `retryable: false`) — повторов
 * больше нет, доставка `failed` и учителя нужно уведомить.
 */
export function nextDeliveryOutcome(
  result: SendResult,
  attemptsBefore: number,
  now: DateTime,
): DeliveryOutcome {
  if (result.status === 'sent') {
    return { status: 'sent', sentAt: now.toJSDate(), externalId: result.externalId };
  }
  if (result.status === 'manual') return { status: 'manual' };

  const attempts = attemptsBefore + 1;
  const delayMin = result.retryable ? DELIVERY_RETRY_DELAYS_MIN[attempts - 1] : undefined;
  if (delayMin === undefined) {
    return { status: 'failed', attempts, error: result.error, notifyTeacher: true };
  }
  return {
    status: 'pending',
    attempts,
    nextAttemptAt: now.plus({ minutes: delayMin }).toJSDate(),
    error: result.error,
  };
}

/**
 * Сбой до/вне адаптера (канал удалён, рассылка не найдена, текст не
 * расшифровался) — сразу `failed`, без повтора: адаптер тут ни при чём,
 * следующая попытка упадёт на том же месте (docs/PLAN.md §6).
 */
export function failNoRetryOutcome(
  attemptsBefore: number,
  error: string,
): DeliveryOutcome {
  return { status: 'failed', attempts: attemptsBefore + 1, error, notifyTeacher: true };
}
