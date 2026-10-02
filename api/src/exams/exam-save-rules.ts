// Правила сохранения и публикации формы (ТЗ 4.3) — вынесены из ExamsService
// (файл-лимит CLAUDE.md «Храповики»: сервису понадобилось место под гард
// снятия с публикации, exam-unpublish-guard.ts). Чистые функции над моделью
// банка вопросов, второй копии правил нет: сервис зовёт их же.
import type { Model } from 'mongoose';
import { InvalidInputError } from '../common/errors';
import { assertBlocksConsistent, hasAnyQuestion } from './exam-blocks';
import { assertItemsEligible } from './exam-items-eligible';
import type { ExamItemRecord } from './exam-item.schema';
import type { ExamBlockRecord } from './exam.schema';

const EMPTY_EXAM_MESSAGE =
  'В форме нет ни одного вопроса. Добавьте хотя бы один блок с вопросом, потом публикуйте.';

/** ТЗ 4.3, п.2–4: вопрос не повторяется по всей форме и ссылается только на
 * опубликованный вопрос банка. Зовётся при каждом сохранении блоков —
 * черновик формы уже не должен ссылаться на чужой/удалённый/неопубликованный id. */
export async function assertBlocksSavable(
  itemModel: Model<ExamItemRecord>,
  blocks: ExamBlockRecord[],
): Promise<void> {
  assertBlocksConsistent(blocks);
  await assertItemsEligible(itemModel, blocks);
}

/** ТЗ 4.3, п.1–2: инвариант published-формы — не пустая, и вопрос блока
 * всё ещё опубликован в банке. Зовётся на переходе в `published` и на
 * каждом сохранении уже опубликованной (update(), блокер аудита №3). */
export async function assertPublishable(
  itemModel: Model<ExamItemRecord>,
  blocks: ExamBlockRecord[],
): Promise<void> {
  if (!hasAnyQuestion(blocks)) throw new InvalidInputError(EMPTY_EXAM_MESSAGE);
  await assertItemsEligible(itemModel, blocks);
}
