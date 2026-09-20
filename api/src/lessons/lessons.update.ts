// Подготовка команды PATCH даты занятия — чистая логика, юнит-тест без Mongo
// (CLAUDE.md «Тесты»); сам findOneAndUpdate и пересборка рассылки при
// переносе (ADR-0054) — в LessonsService.update (файл-лимит 150 строк,
// CLAUDE.md «Храповики», образец — lessons.create.ts).
import { NULLABLE_LESSON_FIELDS, normalizeTags, type UpdateLessonInput } from '@xuanxue/shared';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { encryptRecord } from '../utils/encryption';
import { parseUtcIso } from './lesson-dates';
import { LESSON_ENCRYPT_SCHEMA } from './lesson.schema';

/** `$set`/`$unset` и шифрование секретов из тела PATCH. `startsAt` меняет
 * только фактическое время начала — `plannedAt` (identity слота для
 * планировщика, см. lesson.schema.ts) не трогаем. `tags` нормализуется
 * отдельно от `splitUpdate`, только если поле прислали — иначе PATCH без
 * тегов затёр бы прежние пустым массивом (тот же принцип, что у
 * MaterialsService.update). */
export function buildUpdateCommand(input: UpdateLessonInput): UpdateCommand {
  const { startsAt, tags, ...rest } = input;
  const { $set, $unset } = splitUpdate(rest, NULLABLE_LESSON_FIELDS);
  if (startsAt !== undefined) {
    $set.startsAt = parseUtcIso(startsAt, 'startsAt').toJSDate();
  }
  if (tags !== undefined) {
    $set.tags = normalizeTags(tags);
  }
  const update: UpdateCommand = { $set: encryptRecord($set, LESSON_ENCRYPT_SCHEMA) };
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  return update;
}
