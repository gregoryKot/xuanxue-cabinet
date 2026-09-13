// Поиск попытки «в работе» и её закрытие по дедлайну (ТЗ 4.4, п.3 и п.7) —
// вынесено из ExamAttemptsService, чтобы сервис оставался диспетчером правил,
// а не Mongo-запросов (CLAUDE.md «Файлы», лимит размера). Против настоящей
// Mongo, не мока (CLAUDE.md «Тесты») — тот же приём, что у `claimOnce`
// (common/claim-once.ts): модель параметром, условный апдейт внутри держит
// гонку без блокировок на уровне приложения.
//
// `onExpiredClose` (слой 4.7, PLAN §11) — необязательный колбэк, вызывающий
// код может передать сюда «отправь уведомление об авто-сдаче». Ровно одна
// причина: только этот файл знает, ЭТОТ ли вызов только что выиграл гонку
// `findOneAndUpdate` и правда перевёл попытку в `submitted` (ветка `updated`
// ниже) — снаружи (после `await`) все конкурирующие вызовы возвращают один и
// тот же итоговый статус, и различить «я перевёл» от «кто-то уже перевёл до
// меня» по одному только возврату нельзя. Колбэк — не async и не await'ится
// здесь (уведомление — сайд-эффект, не часть смысла lifecycle-функции; сам
// он ловит свои ошибки, не бросает — ExamNotifier). Отдельного поля-отметки
// «уведомление отправлено» в схеме попытки не заводим: единственность и так
// гарантирована условием `status: 'in_progress'` в фильтре апдейта ниже —
// Mongo пропускает через него ровно один конкурентный вызов на документ, а
// второй раз этот же документ сюда не попадёт (статус уже не `in_progress`,
// функция выходит на первой строке). Поле дублировало бы гарантию, которая
// уже есть.
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
  onExpiredClose?: (closed: LeanExamAttempt) => void,
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
  if (updated) {
    const closed = decryptAttempt(updated);
    onExpiredClose?.(closed);
    return closed;
  }

  // Конкурентный запрос уже закрыл её первым — отдаём актуальное состояние.
  const fresh = await model.findById(attempt._id).lean<RawLeanExamAttempt>();
  return fresh ? decryptAttempt(fresh) : attempt;
}
