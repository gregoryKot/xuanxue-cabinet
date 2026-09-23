// Чтение своей попытки — вынесено из ExamAttemptsService.loadOwn (находка
// файл-храповика: exam-attempts.service.ts не может расти дальше 221 строки).
// Тот же приём, что exam-attempt-start.ts и exam-attempt-lifecycle.ts: сервис
// остаётся диспетчером правил, а не Mongo-запросов (CLAUDE.md «Файлы»).
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { closeIfExpiredAttempt } from './exam-attempt-lifecycle';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import type { ExamAttemptRecord } from './exam-attempt.schema';

export interface LoadOwnAttemptInput {
  model: Model<ExamAttemptRecord>;
  attemptId: string;
  userId: string;
  now: DateTime;
  onClose?: (closed: LeanExamAttempt) => void;
}

/** Владелец из сессии, не из пути (SECURITY §3) — чужой `id` получает
 * `ATTEMPT_NOT_FOUND_MESSAGE`, не 403: не подтверждаем даже факт
 * существования чужой попытки. Лениво закрывает попытку по дедлайну —
 * «любой запрос после дедлайна» (ТЗ 4.4, п.7), не только явный тик. */
export async function loadOwnAttempt({
  model,
  attemptId,
  userId,
  now,
  onClose,
}: LoadOwnAttemptInput): Promise<LeanExamAttempt> {
  assertObjectId(attemptId, ATTEMPT_NOT_FOUND_MESSAGE);
  const doc = await model.findOne({ _id: attemptId, userId }).lean<RawLeanExamAttempt>();
  if (!doc) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
  return closeIfExpiredAttempt(model, decryptAttempt(doc), now, onClose);
}
