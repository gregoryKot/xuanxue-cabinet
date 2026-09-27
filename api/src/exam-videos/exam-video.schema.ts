// Запись о видео вопроса/варианта (ADR-0133, слой 4.2 вслед за картинками) —
// сами байты лежат в Cloudflare R2 (ADR-0057), здесь только ключ объекта и
// метаданные. Данные школы (ADR-0010): доступ штата — по роли, ученику видео
// видно только из снимка его собственной попытки (`exam_attempts.videoIds`,
// SECURITY §3) — решает ExamVideosService, не схема. Срок хранения: пока на
// видео ссылается вопрос банка (`exam_items.videoIds`) или снимок попытки
// (`exam_attempts.videoIds`); видео-сирота старше суток — ExamVideoSweepService.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'exam_videos' })
export class ExamVideoRecord {
  // Ключ объекта в R2 — случайный `exam-videos/<uuid>` (exam-videos.service.ts),
  // не производный от контента и не персональные данные: раскрытие ключа
  // само по себе ничего не говорит о человеке, а без подписанной ссылки
  // (FileStoreService.signedGetUrl) объект всё равно не открыть.
  @Prop({ type: String, required: true })
  key!: string;

  @Prop({ type: String, enum: EXAM_VIDEO_CONTENT_TYPES, required: true })
  contentType!: ExamVideoContentType;

  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  // Кто загрузил — не признак владения (данные школы, ADR-0010), просто
  // ссылка. См. USER_REFERENCE_PATHS (user-data.registry.ts).
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;
}

export const ExamVideoSchema = SchemaFactory.createForClass(ExamVideoRecord);
// Уборщик сирот следующего слоя ищет видео старше суток, не сославшиеся ни
// на один вопрос/попытку (тот же приём, что exam-image.schema.ts).
ExamVideoSchema.index({ createdAt: 1 });

// `key`/`contentType` — свободного текста с персональными данными в них нет
// (см. комментарий у `key` выше и `contentType` — перечисление); explicit
// `plain` — решение encryption-coverage.spec.ts требует для каждого поля,
// не только для String со свободным текстом.
export const EXAM_VIDEO_FIELD_POLICY: FieldPolicy = {
  key: plain(
    'случайный ключ объекта R2, не персональные данные — без подписанной ссылки не открыть',
  ),
};
