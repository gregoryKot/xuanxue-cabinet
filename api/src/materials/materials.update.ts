// Подготовка команды PATCH материала — чистая логика без похода в базу,
// юнит-тест без Mongo (CLAUDE.md «Тесты», образец — lessons.update.ts). Сам
// findOneAndUpdate — в MaterialsService.update (файл-лимит 150 строк,
// CLAUDE.md «Храповики»).
import {
  NULLABLE_MATERIAL_FIELDS,
  normalizeTags,
  type UpdateMaterialInput,
} from '@xuanxue/shared';
import { splitUpdate, type UpdateCommand } from '../common/patch-update';
import { encryptRecord } from '../utils/encryption';
import { MATERIAL_ENCRYPT_SCHEMA } from './material.schema';

/** `$set`/`$unset` и шифрование секретов из тела PATCH. `tags` нормализуется
 * отдельно от `splitUpdate`, только если поле прислали — иначе PATCH без
 * тегов затёр бы прежние пустым массивом (тот же принцип, что у
 * lessons.update.ts). `url: null` (ADR-0134) — единственное значение
 * `NULLABLE_MATERIAL_FIELDS`, уходит в `$unset`: материал остаётся с файлом,
 * если он у него есть. */
export function buildMaterialUpdateCommand(input: UpdateMaterialInput): UpdateCommand {
  const { tags, ...rest } = input;
  const { $set, $unset } = splitUpdate(rest, NULLABLE_MATERIAL_FIELDS);
  if (tags !== undefined) {
    $set.tags = normalizeTags(tags);
  }
  const update: UpdateCommand = { $set: encryptRecord($set, MATERIAL_ENCRYPT_SCHEMA) };
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  return update;
}
