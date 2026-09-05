// Рассылка (данные школы, ADR-0010): `text` содержит ссылку Zoom с паролем
// (SECURITY §1 п.3), шифруется целиком. `telegramFileId` — для рассылок
// записи видеофайлом, бот публикует по file_id без перезаливки (PLAN §6).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import {
  BROADCAST_KINDS,
  BROADCAST_STATUSES,
  type BroadcastKind,
  type BroadcastStatus,
} from '@xuanxue/shared';
import { enc, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'broadcasts' })
export class BroadcastRecord {
  @Prop({ type: String, enum: BROADCAST_KINDS, required: true })
  kind!: BroadcastKind;

  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: Date, required: true })
  scheduledAt!: Date;

  @Prop({ type: [SchemaTypes.ObjectId], required: true })
  channelIds!: Types.ObjectId[];

  @Prop({ type: SchemaTypes.ObjectId, required: false })
  lessonId?: Types.ObjectId;

  @Prop({ type: String, enum: BROADCAST_STATUSES, default: 'scheduled' })
  status!: BroadcastStatus;

  // См. USER_REFERENCE_PATHS. У рассылки от планировщика (не от человека)
  // отсутствует.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  sentAt?: Date;

  @Prop({ type: String, required: false })
  telegramFileId?: string;

  // Бот шлёт предпросмотр с «Отменить»/«Изменить тему» один раз, не на
  // каждом тике планировщика.
  @Prop({ type: Date, required: false })
  previewSentAt?: Date;
}

export const BroadcastSchema = SchemaFactory.createForClass(BroadcastRecord);
BroadcastSchema.index({ status: 1, scheduledAt: 1 });
// Второй тик планировщика не создаёт вторую ссылку на то же занятие: гонка
// двух тиков/инстансов упирается в этот индекс (та же идея, что у deliveries,
// ADR-0004). Частичный — у recording/manual может быть несколько на занятие,
// а lesson_link без lessonId (ручная отправка ссылки) не должен упираться в
// ключ null. Отмена или сбой не освобождают ключ: повторная ссылка на то же
// занятие — обновление существующего документа, не новый (PLAN §4).
BroadcastSchema.index(
  { lessonId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'lesson_link', lessonId: { $type: 'objectId' } },
  },
);

export const BROADCAST_FIELD_POLICY: FieldPolicy = {
  text: enc,
  telegramFileId: plain('id видео в Telegram, доступ есть только у бота'),
};
