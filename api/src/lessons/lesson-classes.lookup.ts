// Общий join «занятия ученика → классы по id», вынесенный из
// MyLessonsService.findClassesByIds (CLAUDE.md «Одна механика — один
// компонент»): и `/me/lessons`, и `/me/lessons/archive` подтягивают классы
// тем же приёмом ($in + Map) и одинаково собирают из них DTO (расшифровка
// занятия + пропуск даты без класса) — второй раз этот код не пишется,
// оба сервиса зовут функции отсюда (иначе jscpd считает дубль).
import type { Model, Types } from 'mongoose';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../classes/class.schema';
import { decryptRecord } from '../utils/encryption';
import { LESSON_ENCRYPT_SCHEMA } from './lesson.schema';
import type { LeanLesson } from './lesson.mapper';

/** `Pick<ClassRecord, ...>` вместо простого пересечения — тот же приём, что
 * у RawLeanExam/RawLeanExamItem (exam.mapper.ts/exam-item.mapper.ts): иначе
 * тип не проходит ограничение `T extends Record<string, unknown>` у
 * decryptRecord. */
export type LessonClassLookupInput = Pick<
  ClassRecord,
  'title' | 'groupLabel' | 'format' | 'location' | 'zoomLink' | 'zoomPassword'
> & { _id: Types.ObjectId };

export async function findLessonClassesByIds(
  classModel: Model<ClassRecord>,
  classIds: Types.ObjectId[],
): Promise<Map<string, LessonClassLookupInput>> {
  const uniqueIds = [...new Set(classIds.map((id) => id.toString()))];
  const docs = await classModel
    .find({ _id: { $in: uniqueIds } })
    .lean<LessonClassLookupInput[]>();
  return new Map(
    docs.map((doc) => [doc._id.toString(), decryptRecord(doc, CLASS_ENCRYPT_SCHEMA)]),
  );
}

/** `skip` — экран ученика не должен падать из-за одной битой даты;
 * `fail` — публичный контракт (ADR-0170): нет класса — 500, а не молчаливо
 * пропущенное занятие в расписании, которое daychi покажет как «занятия нет». */
export interface JoinLessonsOptions {
  missingClass: 'skip' | 'fail';
}

/**
 * Расшифровывает каждую дату занятия и собирает из неё DTO вместе с классом
 * из `classById` (см. `findLessonClassesByIds`). Дата, у которой класс не
 * нашёлся — рассинхрон данных (класс у даты занятия удалить нельзя, пока на
 * него ссылается хоть одна дата, ClassesService.remove). По умолчанию
 * (`missingClass: 'skip'`) её молча пропускают, не роняя весь список ученику;
 * с `'fail'` бросают ошибку: публичное расписание не имеет права тихо
 * потерять занятие (контракт Workshop, ADR-0170), глобальный фильтр отдаст
 * 500 `internal_error` без частичного массива.
 */
export function joinLessonsWithClasses<T>(
  docs: LeanLesson[],
  classById: Map<string, LessonClassLookupInput>,
  toDto: (lesson: LeanLesson, cls: LessonClassLookupInput) => T,
  options: JoinLessonsOptions = { missingClass: 'skip' },
): T[] {
  return docs
    .map((doc) => {
      const cls = classById.get(doc.classId.toString());
      if (!cls) {
        if (options.missingClass === 'fail') {
          throw new Error(
            `Занятие ${doc._id.toString()} ссылается на несуществующий класс ${doc.classId.toString()}`,
          );
        }
        return null;
      }
      return toDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA), cls);
    })
    .filter((dto): dto is T => dto !== null);
}
