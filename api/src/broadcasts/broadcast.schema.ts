// Рассылка (данные школы, ADR-0009): `text` содержит ссылку Zoom с паролем
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

  // Появится вместе с моделью пользователей — см. USER_REFERENCE_PATHS. У рассылки от
  // планировщика (не от человека) отсутствует.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  sentAt?: Date;

  @Prop({ type: String, required: false })
  telegramFileId?: string;

  // Бот шлёт предпросмотр с «Отменить»/«Изменить тему» один раз, не на
  // каждом тике планировщика (появится вместе с ботом учителя).
  @Prop({ type: Date, required: false })
  previewSentAt?: Date;
}

export const BroadcastSchema = SchemaFactory.createForClass(BroadcastRecord);
BroadcastSchema.index({ status: 1, scheduledAt: 1 });
// Второй тик планировщика не создаёт вторую ссылку на то же занятие: гонка
// двух тиков/инстансов упирается в этот индекс (та же идея, что у deliveries,
// ADR-0004). Частичный — у recording/manual может быть несколько на занятие.
BroadcastSchema.index(
  { lessonId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { kind: 'lesson_link' } },
);

export const BROADCAST_FIELD_POLICY: FieldPolicy = {
  text: enc,
  telegramFileId: plain('id видео в Telegram, доступ есть только у бота'),
};
