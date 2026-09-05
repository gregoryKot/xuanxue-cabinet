// Доставка рассылки в канал (данные школы, ADR-0010). Уникальный индекс
// (broadcastId, channelId) — единственная гарантия идемпотентности
// (ADR-0004): отправка начинается с insert, второй insert падает на индексе.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { DELIVERY_STATUSES, type DeliveryStatus } from '@xuanxue/shared';
import { enc, plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'deliveries' })
export class DeliveryRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  broadcastId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  channelId!: Types.ObjectId;

  @Prop({ type: String, enum: DELIVERY_STATUSES, default: 'pending' })
  status!: DeliveryStatus;

  @Prop({ type: Number, default: 0 })
  attempts!: number;

  @Prop({ type: Date, required: false })
  nextAttemptAt?: Date;

  // Текст ошибки провайдера может содержать фрагменты запроса с токеном —
  // scrub секретов канала делает адаптер канала до записи и до лога
  // (SECURITY §6), здесь запись в базу уже под шифрованием.
  @Prop({ type: String, required: false })
  error?: string;

  @Prop({ type: Date, required: false })
  sentAt?: Date;

  @Prop({ type: String, required: false })
  externalId?: string;
}

export const DeliverySchema = SchemaFactory.createForClass(DeliveryRecord);
DeliverySchema.index({ broadcastId: 1, channelId: 1 }, { unique: true });
DeliverySchema.index({ status: 1, nextAttemptAt: 1 });

export const DELIVERY_FIELD_POLICY: FieldPolicy = {
  error: enc,
  externalId: plain('id сообщения в мессенджере, не секрет'),
};
