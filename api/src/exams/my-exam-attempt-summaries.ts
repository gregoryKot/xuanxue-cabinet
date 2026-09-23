// Агрегация попыток ученика по всем формам списка `/me/exams` вместо
// вычитывания и расшифровки всех попыток (CLAUDE.md «API»: «Списки — всегда
// с лимитом… Запрос „дай всё“ запрещён»). Замер на проде 2026-09-23: без
// агрегации `GET /me/exams` вычитывал и расшифровывал КАЖДУЮ попытку ученика
// по КАЖДОЙ форме за всё время ради двух чисел на форму (сколько попыток и
// какая из них последняя) — медиана 6,0 с, максимум 15,2 с, и цена растёт с
// каждой новой попыткой. С агрегацией расшифровывается только сама последняя
// попытка на форму (MyExamsService.loadAttemptSummaries), не весь список.
//
// Сортировка `{ examId: 1, attemptNo: -1 }` делается на самой базе перед
// `$group` — первый документ в группе (`$first`) и есть последняя попытка;
// порядок не зависит от «естественного» порядка Mongo (детерминизм,
// CLAUDE.md «Тесты»).
//
// ЛОВУШКА: `Model.aggregate()`, в отличие от `find()`, не кастует значения
// `$match` к типам схемы сам — `userId`/`examId` в схеме (exam-attempt.schema.ts)
// объявлены как `SchemaTypes.ObjectId`, а сюда приходят строками из сессии и
// из списка форм. Без явного `new Types.ObjectId(...)` `$match` молча не
// находит ничего (пустой результат, не ошибка) — экран «Заданий» показал бы
// ноль попыток у любого ученика. Тест
// `my-exam-attempt-summaries.spec.ts` подряжен ловить именно это.
import { Types, type Model } from 'mongoose';
import type { RawLeanExamAttempt } from './exam-attempt.mapper';
import type { ExamAttemptRecord } from './exam-attempt.schema';

export interface LoadAttemptSummariesParams {
  attemptModel: Model<ExamAttemptRecord>;
  examIds: readonly string[];
  userId: string;
}

export interface AttemptAggregateSummary {
  attemptsUsed: number;
  /** Сырой документ последней попытки (наибольший `attemptNo`) — ещё не
   * расшифрован: решение, расшифровывать ли и когда, остаётся за вызывающим
   * кодом (MyExamsService), здесь — только выборка из базы. */
  latest: RawLeanExamAttempt;
}

/** Строка результата агрегации — `$$ROOT` в `$first` даёт весь документ
 * попытки, `_id` группы при этом — значение `examId`, по которому
 * группировали, не `_id` самой попытки. */
interface AttemptSummaryAggregateRow {
  _id: Types.ObjectId;
  attemptsUsed: number;
  latest: RawLeanExamAttempt;
}

/** Одним запросом на весь список форм (не N+1, тот же приём, что
 * `findLinkBroadcastStatusByLessonId` у /lessons): сколько попыток ученик
 * начал по каждой форме и сырой документ самой свежей из них. Ключ карты —
 * `examId` строкой. */
export async function aggregateAttemptSummaries(
  params: LoadAttemptSummariesParams,
): Promise<Map<string, AttemptAggregateSummary>> {
  const { attemptModel, examIds, userId } = params;
  if (examIds.length === 0) return new Map();

  const rows = await attemptModel.aggregate<AttemptSummaryAggregateRow>([
    {
      $match: {
        userId: new Types.ObjectId(userId),
        examId: { $in: examIds.map((examId) => new Types.ObjectId(examId)) },
      },
    },
    { $sort: { examId: 1, attemptNo: -1 } },
    {
      $group: {
        _id: '$examId',
        attemptsUsed: { $sum: 1 },
        latest: { $first: '$$ROOT' },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      row._id.toString(),
      { attemptsUsed: row.attemptsUsed, latest: row.latest },
    ]),
  );
}
