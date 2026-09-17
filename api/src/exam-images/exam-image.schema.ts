// Байты картинки варианта ответа (ADR-0035, docs/PLAN.md §11 слой 4.2).
// Данные школы (ADR-0010): доступ штата — по роли, не по владельцу; ученику
// картинка видна только из снимка его собственной попытки
// (`exam_attempts.imageIds`, SECURITY §3) — решает ExamImagesService, не
// схема. Срок хранения: пока на картинку ссылается вопрос банка
// (`exam_items.imageIds`) или снимок попытки (`exam_attempts.imageIds`);
// картинка-сирота старше суток — задача уборщика следующего слоя (ADR-0035,
// «Последствия»).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_IMAGE_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamImageContentType } from '@xuanxue/shared';
import { enc, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'exam_images' })
export class ExamImageRecord {
  // Зашифровано вручную (`encryptBytes`/`decryptBytes`,
  // utils/encryption-bytes.ts) в сервисе, не через encryptRecord — тот умеет
  // только строки верхнего уровня документа, не Buffer.
  @Prop({ type: Buffer, required: true })
  bytes!: Buffer;

  @Prop({ type: String, enum: EXAM_IMAGE_CONTENT_TYPES, required: true })
  contentType!: ExamImageContentType;

  // Размер исходной (незашифрованной) картинки: шифротекст длиннее на
  // IV/tag, а лимит и число в карточке «Экзамены» (CLAUDE.md «Продуктовая
  // фича = число в своём разделе») должны отражать настоящий размер файла.
  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  // Кто загрузил — не признак владения (данные школы, ADR-0010), просто
  // ссылка. См. USER_REFERENCE_PATHS (user-data.registry.ts).
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;

  // Кэш file_id Telegram (слой 4б.2, ADR-0035) — после первой отправки этой
  // картинки в бот, чтобы не гонять байты на каждый показ вопроса
  // (exam-question-album-send.ts). Тот же приём, что media_assets.fileId:
  // ведёт к файлу у конкретного бота, шифруем как ссылку на видео (SECURITY §5).
  @Prop({ type: String, required: false })
  telegramFileId?: string;
}

export const ExamImageSchema = SchemaFactory.createForClass(ExamImageRecord);
// Уборщик сирот следующего слоя ищет картинки старше суток, не
// сославшиеся ни на один вопрос/попытку (ADR-0035, «Последствия»).
ExamImageSchema.index({ createdAt: 1 });

// `contentType` — перечисление (enum), решения не требует
// (encryption-coverage.spec.ts отличает enum от свободного текста по
// options.enum, не по имени поля); `bytes` — Buffer, вне охвата String/Mixed
// по той же причине, шифруется явно `encryptBytes` в сервисе; ротация ключа
// его отдельно перешифровывает — RUNBOOK §6.1. `telegramFileId` — решение у
// самого поля выше.
export const EXAM_IMAGE_FIELD_POLICY: FieldPolicy = {
  telegramFileId: enc,
};

/** Схема шифрования — та же роль, что MEDIA_ASSET_ENCRYPT_SCHEMA
 * (media-asset.schema.ts): читающий telegramFileId мимо неё получит
 * шифротекст вместо file_id. */
export const EXAM_IMAGE_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_IMAGE_FIELD_POLICY);
