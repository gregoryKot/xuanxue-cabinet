// «Все вопросы блоков — из опубликованного банка»: проверка нужна и при
// сохранении формы, и при публикации (ТЗ 4.3), а сам сервис упёрся в лимит
// размера (CLAUDE.md «Храповики») — вынесена сюда одной функцией, без
// состояния.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import { pluralRu } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { QUESTION_FORMS } from './exam-blocks';
import type { ExamItemRecord } from './exam-item.schema';
import type { ExamBlockRecord } from './exam.schema';

export async function assertItemsEligible(
  itemModel: Model<ExamItemRecord>,
  blocks: ExamBlockRecord[],
): Promise<void> {
  const ids = [...new Set(blocks.flatMap((block) => block.itemIds))];
  if (ids.length === 0) return;
  const validObjectIds = ids.filter((id) => Types.ObjectId.isValid(id));
  const published = await itemModel
    .find({ _id: { $in: validObjectIds }, status: 'published' })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  const publishedIds = new Set(published.map((doc) => doc._id.toString()));
  const notEligibleCount = ids.filter((id) => !publishedIds.has(id)).length;
  if (notEligibleCount === 0) return;
  throw new InvalidInputError(
    `В блоках ${notEligibleCount} ${pluralRu(notEligibleCount, QUESTION_FORMS)} не ` +
      'из опубликованного банка: вопрос удалили или ещё не опубликовали. Уберите их ' +
      'из блока или опубликуйте вопрос в «Вопросах».',
  );
}
