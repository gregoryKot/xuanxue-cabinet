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
 * RawLeanGradingCommentPreset (grading-comment-preset.mapper.ts). */
export type RawLeanMaterial = Pick<MaterialRecord, keyof MaterialRecord> & {
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
    createdBy: doc.createdBy.toString(),
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}

/** Библиотека глазами ученика (ADR-0048, слой 3.1 shared/src/materials.ts) —
 * ни `createdBy`, ни `access`, ни служебных дат. `url` есть всегда и
 * `locked` не выставляется: рубильник платного доступа появляется слоем 3.4,
 * до этого `paid` ведёт себя как `all` (ADR-0048). */
export function toMyMaterialDto(doc: RawLeanMaterial): MyMaterialDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    kind: doc.kind,
    classIds: doc.classIds.map((id) => id.toString()),
    url: doc.url,
  };
}
