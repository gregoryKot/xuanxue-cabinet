// Поиск попытки «в работе» и её закрытие по дедлайну (ТЗ 4.4, п.3 и п.7) —
// вынесено из ExamAttemptsService, чтобы сервис оставался диспетчером правил,
// а не Mongo-запросов (CLAUDE.md «Файлы», лимит размера). Против настоящей
// Mongo, не мока (CLAUDE.md «Тесты») — тот же приём, что у `claimOnce`
// (common/claim-once.ts): модель параметром, условный апдейт внутри держит
// гонку без блокировок на уровне приложения.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import type { ExamAttemptRecord } from './exam-attempt.schema';

export async function findInProgressAttempt(
  model: Model<ExamAttemptRecord>,
  examId: string,
  userId: string,
): Promise<LeanExamAttempt | null> {
  const doc = await model
    .findOne({ examId, userId, status: 'in_progress' })
    .lean<RawLeanExamAttempt>();
  return doc ? decryptAttempt(doc) : null;
}

/** Закрывает попытку по дедлайну прямо сейчас, если время уже вышло — любой
 * запрос после дедлайна должен увидеть правду, не только явный тик
 * (ТЗ 4.4, п.7). Условный апдейт по `status: 'in_progress'`: гонка
 * параллельного запроса не создаёт двух закрытий, второй просто перечитывает
 * актуальное состояние. */
export async function closeIfExpiredAttempt(
  model: Model<ExamAttemptRecord>,
  attempt: LeanExamAttempt,
  now: DateTime,
): Promise<LeanExamAttempt> {
  if (attempt.status !== 'in_progress' || !attempt.deadlineAt) return attempt;
  if (now.toJSDate() < attempt.deadlineAt) return attempt;

  const updated = await model
    .findOneAndUpdate(
      { _id: attempt._id, status: 'in_progress' },
      { $set: { status: 'submitted', expired: true, submittedAt: attempt.deadlineAt } },
      { returnDocument: 'after' },
    )
    .lean<RawLeanExamAttempt>();
  if (updated) return decryptAttempt(updated);

  // Конкурентный запрос уже закрыл её первым — отдаём актуальное состояние.
  const fresh = await model.findById(attempt._id).lean<RawLeanExamAttempt>();
  return fresh ? decryptAttempt(fresh) : attempt;
}
