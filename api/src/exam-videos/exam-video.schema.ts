// Запись о видео вопроса/варианта (ADR-0133, слой 4.2 вслед за картинками) —
// сами байты лежат в Cloudflare R2 (ADR-0057), здесь только ключ объекта и
// метаданные. Состояние загрузки частями (ключ, части, статус, метка сборки,
// ADR-0165) — общий класс video-uploads/video-upload.schema.ts: видео вопроса
// грузится тем же ядром, что видео-ответ. Данные школы (ADR-0010): доступ штата —
// по роли, ученику видео видно только из снимка его собственной попытки
// (`exam_attempts.videoIds`, SECURITY §3) — решает ExamVideosService, не схема.
// Срок хранения: пока на видео ссылается вопрос банка (`exam_items.videoIds`)
// или снимок попытки (`exam_attempts.videoIds`); видео-сирота старше суток —
// ExamVideoSweepService; брошенная загрузка (`uploading`) — он же, по сроку
// из video-uploads/.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { enc, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';
import {
  VIDEO_UPLOAD_FIELD_POLICY,
  VideoUploadRecord,
} from '../video-uploads/video-upload.schema';

@Schema({ timestamps: true, collection: 'exam_videos' })
export class ExamVideoRecord extends VideoUploadRecord {
  // Кто загрузил — не признак владения (данные школы, ADR-0010), просто
  // ссылка. См. USER_REFERENCE_PATHS (user-data.registry.ts). По нему же
  // проверяется, чью загрузку частями продолжает штат: чужая — 404.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;

  // Кэш file_id Telegram (2026-09-27, «Уточнено» ADR-0133) — после первой
  // отправки этого видео в бот, тем же приёмом, что exam_images.telegramFileId
  // (ADR-0035): следующий показ вопроса шлёт файл строкой, не байтами.
  @Prop({ type: String, required: false })
  telegramFileId?: string;
}

export const ExamVideoSchema = SchemaFactory.createForClass(ExamVideoRecord);
// Уборщик сирот ищет видео старше суток, не сославшиеся ни на один
// вопрос/попытку (тот же приём, что exam-image.schema.ts). `_id` вторым
// ключом — чтобы фильтр `$nin` по используемым отсеивался по ключам индекса,
// а не после чтения каждого документа (аудит 2026-10-01, F54, ревью PR #525).
ExamVideoSchema.index({ createdAt: 1, _id: 1 });
// Продолжение загрузки (ADR-0165): незаконченная загрузка того же учителя с тем
// же файлом.
ExamVideoSchema.index({ createdBy: 1, status: 1 });
// Уборщик брошенных загрузок (`status: 'uploading'` старше недели).
ExamVideoSchema.index({ status: 1, updatedAt: 1 });

// Общие поля загрузки — решения в VIDEO_UPLOAD_FIELD_POLICY; `telegramFileId`
// — решение у самого поля выше, шифруется тем же приёмом, что exam_images.
// encryption-coverage.spec.ts требует решение для каждого String-поля.
export const EXAM_VIDEO_FIELD_POLICY: FieldPolicy = {
  ...VIDEO_UPLOAD_FIELD_POLICY,
  telegramFileId: enc,
};

/** Схема шифрования — та же роль, что EXAM_IMAGE_ENCRYPT_SCHEMA
 * (exam-image.schema.ts): читающий telegramFileId мимо неё получит
 * шифротекст вместо file_id. */
export const EXAM_VIDEO_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_VIDEO_FIELD_POLICY);
