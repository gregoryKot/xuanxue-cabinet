// Канал рассылки (данные школы, ADR-0009): Telegram, ВК, ручной режим для
// Facebook. `config` — токен/chatId, зашифрован целиком как JSON и никогда
// не покидает сервер (ни в одном toDto, ни для одной роли — SECURITY §3).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { CHANNEL_TYPES, type ChannelType } from '@xuanxue/shared';
import { encJson, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'channels' })
export class ChannelRecord {
  @Prop({ type: String, enum: CHANNEL_TYPES, required: true })
  type!: ChannelType;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  config!: string;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  // См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;
}

export const ChannelSchema = SchemaFactory.createForClass(ChannelRecord);
ChannelSchema.index({ type: 1 });

export const CHANNEL_FIELD_POLICY: FieldPolicy = {
  title: plain('название для админа в кабинете, не секрет'),
  config: encJson,
};
