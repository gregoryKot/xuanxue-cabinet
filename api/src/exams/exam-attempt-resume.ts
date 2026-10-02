// Продолжение идущей попытки по id из уже снятого снимка `findLastAttempt`
// (F08, аудит 2026-10-01): два чтения подряд — «есть ли in_progress» и
// «какая последняя» — оставляли окно, в котором двойной старт рождал вторую
// `in_progress`. Теперь start() читает один снимок и поднимает идущую
// попытку по её id; отдельный файл, чтобы exam-attempt-lifecycle.ts не рос
// сверх файлового храповика (CLAUDE.md «Храповики»).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { closeIfExpiredAttempt } from './exam-attempt-lifecycle';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import type { ExamAttemptRecord } from './exam-attempt.schema';

/** `null` — попытку только что снесли (повторный старт конкурента), и
 * вызывающий идёт по ветке создания. Просроченная закрывается лениво тем же
 * closeIfExpiredAttempt, что и на остальных путях. */
export async function resumeAttemptById(
  model: Model<ExamAttemptRecord>,
  attemptId: Types.ObjectId,
  now: DateTime,
  onExpiredClose?: (closed: LeanExamAttempt) => void,
): Promise<LeanExamAttempt | null> {
  const doc = await model.findById(attemptId).lean<RawLeanExamAttempt>();
  if (!doc) return null;
  return closeIfExpiredAttempt(model, decryptAttempt(doc), now, onExpiredClose);
}
