// Запись отметки «ученик открыл задание» (ADR-0129) — отдельным файлом от
// my-exams.service.ts (тот уже читает форму и попытки, файл-лимит CLAUDE.md
// «Храповики»), тем же приёмом, что in-app-staff-write.ts у ленты
// уведомлений: findOneAndUpdate(upsert) + try/catch на E11000, потому что
// upsert сам не гарантирует, что не столкнётся с дублем при параллельной
// записи (второй клик по той же карточке до ответа первого).
import type { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import type { ExamSeenMarkRecord } from './exam-seen-mark.schema';

export async function markExamSeen(
  model: Model<ExamSeenMarkRecord>,
  userId: string,
  examId: string,
): Promise<void> {
  const filter = { userId, examId };
  try {
    // $setOnInsert, не пустой апдейт: у записи нет полей сверх ключа
    // фильтра, но Mongoose отказывается апсертить по пустому документу
    // обновления — явно повторяем фильтр как то, что вставится при создании.
    await model.findOneAndUpdate(filter, { $setOnInsert: filter }, { upsert: true });
  } catch (err) {
    // Гонка: конкурент вставил первым — запись уже стоит, повторять нечего.
    if (!isDuplicateKeyError(err)) throw err;
  }
}
