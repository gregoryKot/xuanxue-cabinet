// Названия занятий одним запросом на весь список материалов — ученику они
// нужны подписью к материалу (ADR-0047), а `GET /classes` ему закрыт ролью.
// Тот же приём `$in` + Map, что у findLessonClassesByIds
// (lessons/lesson-classes.lookup.ts); своя функция, а не та: там из класса
// достают ссылку Zoom и место, здесь — одно название. Вынесено из
// MaterialsService отдельным файлом ради лимита файла (CLAUDE.md
// «Храповики», 150 строк) — тот же приём, что materials.queries.ts.
import type { Model, Types } from 'mongoose';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../classes/class.schema';
import { decryptRecord } from '../utils/encryption';

/** Из класса библиотеке нужно одно название — `Pick` вместо всего документа,
 * тот же приём, что у RawLeanMyLessonClass (lessons/lesson-classes.lookup.ts):
 * иначе тип не проходит ограничение `T extends Record<string, unknown>` у
 * decryptRecord. */
type RawLeanMaterialClass = Pick<ClassRecord, 'title'> & { _id: Types.ObjectId };

export async function findMaterialClassTitles(
  classModel: Model<ClassRecord>,
  classIds: Types.ObjectId[][],
): Promise<Map<string, string>> {
  const ids = [...new Set(classIds.flat().map(String))];
  if (ids.length === 0) return new Map();
  const classes = await classModel
    .find({ _id: { $in: ids } })
    .lean<RawLeanMaterialClass[]>();
  return new Map(
    classes.map((cls) => [
      cls._id.toString(),
      decryptRecord(cls, CLASS_ENCRYPT_SCHEMA).title,
    ]),
  );
}
