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

  // Захват DeliveryRunnerService (findOneAndUpdate pending → sending):
  // второй инстанс отличает «взято сейчас» от «взято и брошено» по этому
  // времени, не по флагу в памяти (ADR-0004).
  @Prop({ type: Date, required: false })
  lockedAt?: Date;

  // Текст ошибки провайдера может содержать фрагменты запроса с токеном —
  // scrub секретов канала делает DeliveryRunnerService.deliverOne до записи и
  // до лога (SECURITY §6); само поле дополнительно шифруется по
  // DELIVERY_FIELD_POLICY (error: enc) — обе меры нужны обе: scrub чистит
  // текст, который иначе попал бы в лог как есть, шифрование прячет то, что
  // осталось, от прямого чтения коллекции.
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
