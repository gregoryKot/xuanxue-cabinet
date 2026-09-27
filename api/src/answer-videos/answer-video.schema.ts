// Загрузка видео-ответа ученика частями (ADR-0137, уточняет ADR-0023/
// ADR-0084/ADR-0133). Данные ученика (ADR-0010): `userId` — владение,
// USER_OWNED_COLLECTIONS (чеклист CLAUDE.md «Новая коллекция»); объект в R2
// не документ Mongo, поэтому удаление аккаунта дотягивается через
// USER_OWNED_STORAGE_CASCADES (user-data.registry.ts) — журналу сирот отдаём
// ключ ДО deleteMany. Срок хранения — ANSWER_VIDEO_RETENTION (90 дней после
// проверки, год без неё), убирает AnswerVideoSweepService шагом планировщика.
//
// Отдельная коллекция от `exam_videos` (см. ADR-0137 «Решение», абзац
// «Отдельная коллекция…») — там видео школы без владельца-ученика и другой
// уборщик по ссылкам вопроса/попытки, здесь — по владельцу и сроку.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';

const ANSWER_VIDEO_STATUSES = ['uploading', 'ready'] as const;
export type AnswerVideoStatus = (typeof ANSWER_VIDEO_STATUSES)[number];

export interface AnswerVideoPart {
  n: number;
  etag: string;
}

/** Часть, принятая R2 — номер и ETag, нужны в неизменном порядке для
 * `CompleteMultipartUpload` (multipart-store.service.ts). Тот же приём
 * субдокумента, что RecordingSubdoc (lessons/lesson.schema.ts). */
@Schema({ _id: false })
class AnswerVideoPartSubdoc implements AnswerVideoPart {
  @Prop({ type: Number, required: true })
  n!: number;

  @Prop({ type: String, required: true })
  etag!: string;
}
const AnswerVideoPartSchema = SchemaFactory.createForClass(AnswerVideoPartSubdoc);

@Schema({ timestamps: true, collection: 'answer_videos' })
export class AnswerVideoRecord {
  // Владение (USER_OWNED_COLLECTIONS) — без `ref`, тем же приёмом, что
  // ExamAttemptRecord.userId: это признак владения, не обычная ссылка
  // (USER_REFERENCE_PATHS про другое — см. user-data.registry.ts).
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  attemptId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;

  // Ключ объекта в R2 — случайный `answer-videos/<uuid>`, не персональные
  // данные (тот же довод, что ExamVideoRecord.key): без подписанной ссылки
  // не открыть.
  @Prop({ type: String, required: true })
  key!: string;

  // Необязателен до первой части — определяется сигнатурой байтов
  // (sniffVideoSignature), не заголовком клиента (SECURITY §4).
  @Prop({ type: String, enum: EXAM_VIDEO_CONTENT_TYPES, required: false })
  contentType?: ExamVideoContentType;

  // Заявленный полный размер (StartAnswerVideoInput.sizeBytes) — по нему
  // считается partCount и сверяется размер каждой части.
  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  // Размер и дата изменения файла на диске ученика, без имени (ADR-0137) —
  // не персональные данные (случайные числа устройства), сверяется на
  // resume: тот же файл к тому же вопросу продолжает загрузку.
  @Prop({ type: String, required: true })
  fingerprint!: string;

  @Prop({
    type: String,
    enum: ANSWER_VIDEO_STATUSES,
    required: true,
    default: 'uploading',
  })
  status!: AnswerVideoStatus;

  // UploadId R2 multipart — появляется на первой части, снимается на
  // `complete` ($unset): нет смысла держать закрытую загрузку.
  @Prop({ type: String, required: false })
  uploadId?: string;

  @Prop({ type: [AnswerVideoPartSchema], default: [] })
  parts!: AnswerVideoPart[];

  @Prop({ type: Date, required: false })
  completedAt?: Date;
}

export const AnswerVideoSchema = SchemaFactory.createForClass(AnswerVideoRecord);
// Удаление/перенос аккаунта (USER_OWNED_COLLECTIONS) — по владельцу.
AnswerVideoSchema.index({ userId: 1 });
// Resume (найти незаконченную загрузку того же вопроса) и «прежняя загрузка
// того же вопроса устарела» (media-link-add.ts «заменяет прежнюю», тем же
// смыслом здесь).
AnswerVideoSchema.index({ attemptId: 1, itemId: 1, status: 1 });
// Уборщик брошенных загрузок (`status: 'uploading'` старше недели).
AnswerVideoSchema.index({ status: 1, updatedAt: 1 });
// Уборщик по сроку хранения (`status: 'ready'` старше года без проверки).
AnswerVideoSchema.index({ status: 1, completedAt: 1 });

export const ANSWER_VIDEO_FIELD_POLICY: FieldPolicy = {
  key: plain(
    'случайный ключ объекта R2, не персональные данные — без подписанной ссылки не открыть',
  ),
  uploadId: plain('случайный id операции R2 multipart, не персональные данные'),
  fingerprint: plain(
    'размер и дата изменения файла на диске ученика — числа устройства, не текст о человеке',
  ),
  status: plain('перечисление, нужно для выборок'),
  'parts.etag': plain(
    'технический ETag части от R2, не текст о человеке — вложенное поле, enc/encJson тут не сработает',
  ),
};
