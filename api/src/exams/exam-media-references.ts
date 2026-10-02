// Кто ссылается на картинку/видео экзамена: вопрос банка (`exam_items`,
// текущие варианты или история правок) или снимок попытки (`exam_attempts`) —
// оба держат плоские индексированные копии `imageIds`/`videoIds` именно ради
// этого запроса (ADR-0035, ADR-0133). Общий для ExamImageSweepService и
// ExamVideoSweepService: уборка сирот у обоих одинаковая, повтор запроса в
// двух сервисах — дубль (CLAUDE.md «Одна механика — один компонент»).
import type { Model, Types } from 'mongoose';
import type { ExamAttemptRecord } from './exam-attempt.schema';
import type { ExamItemRecord } from './exam-item.schema';

type ExamMediaField = 'imageIds' | 'videoIds';

interface ExamMediaOwners {
  itemModel: Model<ExamItemRecord>;
  attemptModel: Model<ExamAttemptRecord>;
}

/** Id медиа, на которые ссылается хоть один вопрос или попытка. Без `within`
 * — весь набор (для школы это сотни id, незаметно): так используемые
 * исключаются прямо в запросе кандидатов ($nin), а не после выборки, иначе
 * батч из одних используемых не оставлял сироте места никогда (аудит
 * 2026-10-01, F54). С `within` — повторная сверка уже выбранных кандидатов:
 * страховка от гонки «вопрос сохранён между выборкой и удалением». */
export async function referencedMediaIds(
  { itemModel, attemptModel }: ExamMediaOwners,
  field: ExamMediaField,
  within?: Types.ObjectId[],
): Promise<Types.ObjectId[]> {
  const filter = within ? { [field]: { $in: within } } : {};
  const [inItems, inAttempts] = await Promise.all([
    itemModel.distinct(field, filter),
    attemptModel.distinct(field, filter),
  ]);
  return [...inItems, ...inAttempts];
}
