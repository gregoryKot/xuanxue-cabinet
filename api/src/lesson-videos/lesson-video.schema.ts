// Запись занятия файлом (ADR-0180, PLAN §18 слой 1) — байты лежат в Cloudflare R2
// (ADR-0057), здесь только ключ объекта и метаданные. Состояние загрузки частями
// (ключ, части, статус, метка сборки, ADR-0165) — общий класс
// video-uploads/video-upload.schema.ts: файл записи грузится тем же ядром, что
// видео вопроса и видео-ответ. Данные школы (ADR-0010): загружает штат, смотрит
// любой вошедший, но только готовое видео, на которое ссылается запись занятия
// (`lessons.recordings.videoId`) — то же правило видимости, что у архива занятий
// (ADR-0114); решает LessonVideosService, не схема.
// Срок хранения: пока на видео ссылается запись занятия; видео-сирота старше суток
// (загрузили и не привязали) и брошенная загрузка (`uploading`) —
// LessonVideoSweepService. Срок по дням (настройка школы) — отдельный слой.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import type { FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';
import {
  VIDEO_UPLOAD_FIELD_POLICY,
  VideoUploadRecord,
} from '../video-uploads/video-upload.schema';

@Schema({ timestamps: true, collection: 'lesson_videos' })
export class LessonVideoRecord extends VideoUploadRecord {
  // Кто загрузил — не признак владения (данные школы, ADR-0010), просто ссылка.
  // См. USER_REFERENCE_PATHS (user-data.registry.ts). По нему же проверяется, чью
  // загрузку частями продолжает штат: чужая — 404.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;
}

export const LessonVideoSchema = SchemaFactory.createForClass(LessonVideoRecord);
// Уборщик сирот ищет видео старше суток; `_id` вторым ключом — чтобы `$nin` по
// используемым отсеивался по ключам индекса (тот же приём, что exam-video.schema.ts).
LessonVideoSchema.index({ createdAt: 1, _id: 1 });
// Продолжение загрузки (ADR-0165): незаконченная загрузка того же учителя с тем же файлом.
LessonVideoSchema.index({ createdBy: 1, status: 1 });
// Уборщик брошенных загрузок (`status: 'uploading'` старше недели).
LessonVideoSchema.index({ status: 1, updatedAt: 1 });

// Своих String-полей сверх общих у вида нет: решения — в VIDEO_UPLOAD_FIELD_POLICY
// (encryption-coverage.spec.ts требует решение для каждого поля).
export const LESSON_VIDEO_FIELD_POLICY: FieldPolicy = {
  ...VIDEO_UPLOAD_FIELD_POLICY,
};
