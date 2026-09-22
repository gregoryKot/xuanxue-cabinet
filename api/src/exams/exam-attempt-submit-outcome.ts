// Разбор причины, по которой findOneAndUpdate в ExamAttemptsService.submit()
// вернул `null` — отдельный файл, а не exam-attempts.service.ts (тот уже на
// потолке лимита размера, CLAUDE.md «Файлы») и не exam-attempt-lifecycle.ts
// (эта попытка объяснить старую находку — держим рядом одним куском, не
// размазываем по файлу с другой темой).
//
// Аудит 2026-09-21, HIGH: submit() матчит апдейт по `status: 'in_progress'` —
// если он не сработал, статус попытки сменился МЕЖДУ проверкой loadOwn() в
// начале submit() и этой строкой. Раньше `null` читался безусловно как
// «дедлайн истёк», но есть вторая причина: вторая вкладка/устройство того же
// ученика отправило ЭТУ ЖЕ попытку долей секунды раньше — ученик видел
// панику о потере ответа, хотя попытка уже сдана. `resolveSubmitRaceOutcome`
// различает их по `expired` (его выставляет только closeIfExpiredAttempt,
// exam-attempt-lifecycle.ts) — чистая функция, юнит-тест без Mongo и без DI
// (CLAUDE.md «Тесты»). `resolveSubmitConflict` — тонкая обвязка вокруг неё:
// перечитывает актуальное состояние и уже решает, что ответить submit().
import type { Model } from 'mongoose';
import { ATTEMPT_EXPIRED_MESSAGE, ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import type { ExamAttemptRecord } from './exam-attempt.schema';

export type SubmitRaceOutcome = 'expired' | 'already-submitted';

/** Только `expired` отличает «дедлайн» от «сдала другая вкладка» — оба
 * случая переводят статус из `in_progress` в `submitted`/`graded`, но
 * `expired` ставит исключительно closeIfExpiredAttempt. */
export function resolveSubmitRaceOutcome(attempt: {
  expired: boolean;
}): SubmitRaceOutcome {
  return attempt.expired ? 'expired' : 'already-submitted';
}

/** submit() получил `null` от своего findOneAndUpdate — перечитывает попытку
 * и решает по `resolveSubmitRaceOutcome`: дедлайн — прежний отказ «время
 * вышло»; иначе сдала другая вкладка раньше нас — отдаём её результат,
 * submit() не шлёт второе уведомление (оно уже ушло от выигравшей записи,
 * notify-attempt-submitted.ts). Документа нет вовсе (крайний случай, защита
 * в глубину) — та же NotFoundError, что у loadOwn (владение по userId в
 * фильтре, SECURITY §3). */
export async function resolveSubmitConflict(
  model: Model<ExamAttemptRecord>,
  attemptId: string,
  userId: string,
): Promise<LeanExamAttempt> {
  const current = await model
    .findOne({ _id: attemptId, userId })
    .lean<RawLeanExamAttempt>();
  if (!current) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
  const attempt = decryptAttempt(current);
  if (resolveSubmitRaceOutcome(attempt) === 'expired') {
    throw new InvalidInputError(ATTEMPT_EXPIRED_MESSAGE);
  }
  return attempt;
}
