// Единственные мапперы MaterialRecord (lean, уже расшифрованный) →
// MaterialDto/MyMaterialDto (CLAUDE.md, раздел «API»: документ Mongoose
// наружу не возвращается).
import type { Types } from 'mongoose';
import type { MaterialDto, MyMaterialDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { MATERIAL_ENCRYPT_SCHEMA, type MaterialRecord } from './material.schema';

/** MaterialRecord как его отдаёт `.lean()` до расшифровки —
 * `Pick<T, keyof T>` вместо простого пересечения, тот же приём, что у
 * RawLeanGradingCommentPreset (grading-comment-preset.mapper.ts). `tags` —
 * честно необязателен: у материалов, созданных до ADR-0058, поля в
 * документе нет, а `.lean()` default схемы при чтении не подставляет —
 * маппер ниже сам отдаёт `[]`, миграция не нужна (expand, CLAUDE.md
 * «Данные»). */
export type RawLeanMaterial = Omit<Pick<MaterialRecord, keyof MaterialRecord>, 'tags'> & {
  tags?: string[];
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function decryptMaterial(doc: RawLeanMaterial): RawLeanMaterial {
  return decryptRecord(doc, MATERIAL_ENCRYPT_SCHEMA);
}

export function toMaterialDto(doc: RawLeanMaterial): MaterialDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    url: doc.url,
    kind: doc.kind,
    classIds: doc.classIds.map((id) => id.toString()),
    access: doc.access,
    tags: doc.tags ?? [],
    createdBy: doc.createdBy.toString(),
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}

/** Библиотека глазами ученика (ADR-0048, слой 3.4 docs/PLAN.md §14) — ни
 * `createdBy`, ни `access`, ни служебных дат. `isLocked` считает
 * MaterialsService (material-access.ts, isMaterialLocked) — закрытый
 * материал приходит без `url` и с `locked: true`, ссылка не должна уйти в
 * ответ API ни одному ученику (SECURITY §3).
 *
 * Занятия приезжают названиями, а не id: `GET /classes` закрыт ролью, и
 * подписать id ученику нечем (shared/src/materials.ts). Название занятия,
 * которого уже нет, просто выпадает из списка — материал остаётся на месте.
 */
export function toMyMaterialDto(
  doc: RawLeanMaterial,
  classTitleById: Map<string, string>,
  isLocked: boolean,
): MyMaterialDto {
  const base = {
    id: doc._id.toString(),
    title: doc.title,
    kind: doc.kind,
    classTitles: doc.classIds
      .map((id) => classTitleById.get(id.toString()))
      .filter((title): title is string => title !== undefined),
    tags: doc.tags ?? [],
  };
  // `locked`/`url` — ключи, не значения undefined: `toHaveProperty` и
  // JSON.stringify не должны видеть ни намёка на то, что url когда-то был
  // (SECURITY §3, ADR-0048).
  return isLocked ? { ...base, locked: true } : { ...base, url: doc.url };
}
