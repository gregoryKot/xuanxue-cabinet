// Защита удаления экзамена от той же дыры, что у вопроса банка (аудит
// 2026-09-15, п.4 «проверь заодно»): removeIfDraft (exams.service.ts)
// проверял только статус самой формы — учитель мог откатить опубликованную
// форму назад в черновик (переход status ничем не ограничен) и удалить её,
// хотя по ней уже сдавали. exam_gradings.service.ts после этого не находит
// форму через ExamsService.getById (проверка работы падает NotFoundError),
// а MyExamsService теряет источник итога для ученика — те же симптомы, что
// у вопроса банка, только уровнем выше. Архивация той же дыры не даёт:
// заархивированная форма остаётся документом, getById по-прежнему находит
// её — только remove() опасен.
import type { Model } from 'mongoose';
import { EXAM_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { removeIfDraft } from '../common/remove-if-draft';
import type { ExamAttemptRecord } from './exam-attempt.schema';
import type { ExamRecord } from './exam.schema';

// VOICE.md: что случилось и что сделать.
const HAS_ATTEMPTS_MESSAGE =
  'По этой форме уже есть попытки учеников. Удалить нельзя — переведите форму в архив ' +
  'вместо удаления.';

/** Удаляет форму, только если по ней ни разу не начинали попытку — проверка
 * первой и независимо от статуса формы (черновик с чужими попытками тоже не
 * должен пройти), «не черновик» ниже — прежний, вторичный отказ. */
export async function removeExamIfNotAttempted(
  examModel: Model<ExamRecord>,
  attemptModel: Model<ExamAttemptRecord>,
  examId: string,
  notDraftMessage: string,
): Promise<void> {
  const attempted = await attemptModel.exists({ examId });
  if (attempted) throw new ConflictError(HAS_ATTEMPTS_MESSAGE);
  await removeIfDraft(examModel, examId, EXAM_NOT_FOUND_MESSAGE, notDraftMessage);
}
