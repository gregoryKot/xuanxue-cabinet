// Единственные мапперы MaterialRecord (lean, уже расшифрованный) →
// MaterialDto/MyMaterialDto (CLAUDE.md, раздел «API»: документ Mongoose
// наружу не возвращается).
import type { Types } from 'mongoose';
import type { MaterialDto, MaterialFileDto, MyMaterialDto } from '@xuanxue/shared';
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

/** Пять полей документа (ADR-0057) → одно описание файла в ответе. Ключ
 * объекта (`fileKey`) наружу не уходит: по нему файл и скачивается, а право
 * на скачивание проверяем мы. `undefined`, пока файла нет — тогда ключа
 * `file` в JSON не будет вовсе, как у `url` закрытого материала. */
function toMaterialFileDto(doc: RawLeanMaterial): MaterialFileDto | undefined {
  const { fileKey, fileName, fileContentType, fileSizeBytes, fileUploadedAt } = doc;
  if (!fileKey || !fileName || !fileContentType || !fileUploadedAt) return undefined;
  return {
    name: fileName,
    contentType: fileContentType,
    sizeBytes: fileSizeBytes ?? 0,
    uploadedAt: toIsoUtc(fileUploadedAt),
  };
}

/** Одно место, где решается «какие ключи описания файла попадут в объект» —
 * и у штата, и у ученика (CLAUDE.md «Дубли»). */
function fileEntry(doc: RawLeanMaterial): { file?: MaterialFileDto } {
  const file = toMaterialFileDto(doc);
  return file ? { file } : {};
}

export function toMaterialDto(doc: RawLeanMaterial): MaterialDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    url: doc.url,
    kind: doc.kind,
    classIds: doc.classIds.map((id) => id.toString()),
    lessonIds: doc.lessonIds.map((id) => id.toString()),
    access: doc.access,
    tags: doc.tags ?? [],
    ...fileEntry(doc),
    createdBy: doc.createdBy.toString(),
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}

/** Библиотека глазами ученика (docs/PLAN.md §14) — ни `createdBy`, ни
 * `access`, ни служебных дат. Вызывающая сторона (MaterialsService,
 * LessonMaterialsService) уже отсекла материалы, скрытые от ученика
 * (`isMaterialHiddenFromStudent`, ADR-0058) — этот маппер зовут только для
 * материала, который ученику действительно едет, поэтому `url` и файл (если
 * он загружен) в ответе всегда (ADR-0096, отменяет ADR-0048: признака
 * `locked` в контракте больше нет).
 *
 * Занятия приезжают названиями, а не id: `GET /classes` закрыт ролью, и
 * подписать id ученику нечем (shared/src/materials.ts). Название занятия,
 * которого уже нет, просто выпадает из списка — материал остаётся на месте.
 */
export function toMyMaterialDto(
  doc: RawLeanMaterial,
  classTitleById: Map<string, string>,
): MyMaterialDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    kind: doc.kind,
    classTitles: doc.classIds
      .map((id) => classTitleById.get(id.toString()))
      .filter((title): title is string => title !== undefined),
    tags: doc.tags ?? [],
    url: doc.url,
    ...fileEntry(doc),
  };
}
