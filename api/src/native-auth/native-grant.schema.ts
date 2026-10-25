// Нативный доступ — один вход приложения Daychi в аккаунт (ADR-0181, профиль
// Workshop 3c98d4a): продление выпускает новый bearer того же доступа, отзыв
// ставит `revokedAt` доступу и гасит все его bearer сразу. Сам bearer здесь не
// лежит — только в `native_credentials`, и там лишь его sha256.
//
// `purgeAt` — не меньше срока самого позднего bearer доступа: знание об отзыве
// обязано жить, пока хоть один bearer мог бы пройти проверку, иначе TTL стёр бы
// отзыв раньше срока ключа (native-grants.service.ts двигает его `$max`).
//
// retention: пока жив хоть один ключ, до 90 дней после последнего продления.
// userId — владелец, поэтому модель во USER_OWNED_COLLECTIONS: удаление аккаунта
// гасит все его нативные доступы.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'native_grants' })
export class NativeGrantRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  clientId!: string;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop({ type: Date, required: true })
  purgeAt!: Date;
}

export const NativeGrantSchema = SchemaFactory.createForClass(NativeGrantRecord);

NativeGrantSchema.index({ userId: 1 });
// expireAfterSeconds: 0 — Mongo удаляет документ в момент, записанный в поле.
NativeGrantSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const NATIVE_GRANT_FIELD_POLICY: FieldPolicy = {
  clientId: plain('публичный идентификатор приложения из профиля, не данные человека'),
};
