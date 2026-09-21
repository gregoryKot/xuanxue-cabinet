// Материал библиотеки школы (слой 3.1, docs/PLAN.md §14, ADR-0047,
// ADR-0048) — данные школы, не ученика: список общий для всего штата, как
// заготовки комментариев (grading-comment-preset.schema.ts). `title`/`url` —
// свободный текст автора, шифруются как обычные поля верхнего уровня
// (enc, SECURITY §5); `createdBy` — ссылка на автора (USER_REFERENCE_PATHS,
// user-data.registry.ts), не признак владения: удаление аккаунта автора не
// уносит материал школы.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import {
  MATERIAL_ACCESS_LEVELS,
  MATERIAL_FILE_CONTENT_TYPES,
  MATERIAL_KINDS,
  type MaterialAccess,
  type MaterialFileContentType,
  type MaterialKind,
} from '@xuanxue/shared';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'materials' })
export class MaterialRecord {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, required: true, enum: MATERIAL_KINDS })
  kind!: MaterialKind;

  @Prop({ type: String, required: true, default: 'all', enum: MATERIAL_ACCESS_LEVELS })
  access!: MaterialAccess;

  // Привязка к занятию расписания, не к дате (ADR-0047) — рубрикация и
  // фильтр, не доступ: групп у ученика нет, скрывать по ним нечего. Без
  // `ref`: занятия и классы в проекте не связаны populate'ом, тот же приём,
  // что у LessonRecord.classId (lesson.schema.ts).
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  classIds!: Types.ObjectId[];

  // Рубрикация свободным текстом (ADR-0058) — фильтр списка, не доступ:
  // видимость по-прежнему решает `access`. У материалов, созданных до этого
  // поля, документ его не содержит — `.lean()` не подставляет default схемы
  // при чтении (material.mapper.ts, RawLeanMaterial).
  @Prop({ type: [String], default: [] })
  tags!: string[];
  // Привязка к дате занятия (ADR-0056) — ссылка, которую учитель дал один
  // раз с конкретного вторника, а не книга по программе. Рядом с classIds,
  // тот же смысл и тот же приём: рубрикация и фильтр, без `ref`.
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  lessonIds!: Types.ObjectId[];

  // Файл в Cloudflare R2 (ADR-0057) — пятью полями верхнего уровня, а не
  // вложенным объектом: encryptRecord/decryptRecord читают только верхний
  // уровень документа, и `file.name` как `enc` не сработал бы молча
  // (common/field-policy.ts, комментарий к encryptSchemaFrom).
  //
  // Ключ объекта — `materials/<materialId>/<uuid>`, неугадываемый: даже зная
  // структуру, перебрать чужой файл нельзя. Наружу он не отдаётся никогда
  // (material.mapper.ts): скачивание идёт через нашу проверку права.
  @Prop({ type: String })
  fileKey?: string;

  @Prop({ type: String })
  fileName?: string;

  @Prop({ type: String, enum: MATERIAL_FILE_CONTENT_TYPES })
  fileContentType?: MaterialFileContentType;

  @Prop({ type: Number })
  fileSizeBytes?: number;

  @Prop({ type: Date })
  fileUploadedAt?: Date;

  // См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: true })
  createdBy!: Types.ObjectId;
}

export const MaterialSchema = SchemaFactory.createForClass(MaterialRecord);
// Свежие материалы первыми — тот же порядок, что видит штат в списке.
MaterialSchema.index({ createdAt: -1 });
// Фильтр по занятию (GET /api/materials?classId=…) — Mongo ищет вхождение id
// в массиве без full collection scan.
MaterialSchema.index({ classIds: 1 });
// Фильтр по тегу (GET /api/materials?tag=…), как у exam_items (ADR-0058).
MaterialSchema.index({ tags: 1 });
// Фильтр по дате занятия (GET /api/materials?lessonId=…, ADR-0056) — тот же
// приём, что у classIds.
MaterialSchema.index({ lessonIds: 1 });

export const MATERIAL_FIELD_POLICY: FieldPolicy = {
  title: enc,
  url: enc,
  tags: plain('рубрика библиотеки, фильтр в списке; не персональные данные'),
  // Исходное имя файла — свободный текст автора, как title/url (ADR-0057).
  fileName: enc,
  fileKey: plain(
    'ключ объекта в R2 (materials/<id>/<uuid>) — служебный адрес, не текст ' +
      'и не персональные данные; наружу не отдаётся',
  ),
  // fileContentType — перечисление (enum), решения не требует.
  // kind/access — перечисления (enum), не свободный текст: решения не
  // требуют (см. комментарий в common/field-policy.ts и
  // encryption-coverage.spec.ts).
};

/** Схема шифрования материала — одна на все места чтения и записи
 * (MaterialsService). */
export const MATERIAL_ENCRYPT_SCHEMA = encryptSchemaFrom(MATERIAL_FIELD_POLICY);
