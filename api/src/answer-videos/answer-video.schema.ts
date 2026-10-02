// Загрузка видео-ответа ученика частями (ADR-0137, уточняет ADR-0023/
// ADR-0084/ADR-0133). Состояние загрузки (ключ, части, статус, метка сборки) —
// в общем классе video-uploads/video-upload.schema.ts; здесь то, что делает
// видео данными ученика (ADR-0010): `userId` — владение, USER_OWNED_COLLECTIONS
// (чеклист CLAUDE.md «Новая коллекция»); объект в R2 не документ Mongo, поэтому
// удаление аккаунта дотягивается через USER_OWNED_STORAGE_CASCADES
// (user-data.registry.ts) — журналу сирот отдаём ключ ДО deleteMany. Срок
// хранения — ANSWER_VIDEO_RETENTION (90 дней после проверки, год без неё),
// убирает AnswerVideoSweepService шагом планировщика.
//
// Отдельная коллекция от `exam_videos` (см. ADR-0137 «Решение», абзац
// «Отдельная коллекция…») — там видео школы без владельца-ученика и другой
// уборщик по ссылкам вопроса/попытки, здесь — по владельцу и сроку.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import type { FieldPolicy } from '../common/field-policy';
import {
  VIDEO_UPLOAD_FIELD_POLICY,
  VideoUploadRecord,
} from '../video-uploads/video-upload.schema';

@Schema({ timestamps: true, collection: 'answer_videos' })
export class AnswerVideoRecord extends VideoUploadRecord {
  // Владение (USER_OWNED_COLLECTIONS) — без `ref`, тем же приёмом, что
  // ExamAttemptRecord.userId: это признак владения, не обычная ссылка
  // (USER_REFERENCE_PATHS про другое — см. user-data.registry.ts).
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  attemptId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  itemId!: Types.ObjectId;
}

/** Запись как её отдаёт `.lean()` — `Pick<T, keyof T>` вместо простого
 * пересечения, тем же приёмом, что RawLeanExamAttempt (exam-attempt.mapper.ts). */
export type RawLeanAnswerVideo = Pick<AnswerVideoRecord, keyof AnswerVideoRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

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

// Своих текстовых полей у видео-ответа нет — все решения общие для видео-файлов.
export const ANSWER_VIDEO_FIELD_POLICY: FieldPolicy = { ...VIDEO_UPLOAD_FIELD_POLICY };
