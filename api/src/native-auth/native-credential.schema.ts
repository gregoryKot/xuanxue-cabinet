// Нативный bearer (ADR-0181): в базе только sha256 от 32 случайных байт, сырой
// токен нигде не хранится и не логируется. Каждая выдача и каждое продление —
// своя запись; прежняя живёт до своего `expiresAt`, чтобы потерянный ответ
// продления не выкидывал клиента (профиль Workshop 3c98d4a, N09).
//
// retention: 90 дней с выдачи, запись убирает TTL-индекс по `expiresAt`. Отказ в
// доступе после срока даёт проверка `now >= expiresAt` в сервисе, а не TTL: он
// срабатывает с задержкой до минуты.
// userId — владелец (см. native-grant.schema.ts), модель во USER_OWNED_COLLECTIONS.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'native_credentials' })
export class NativeCredentialRecord {
  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  grantId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  issuedAt!: Date;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export const NativeCredentialSchema =
  SchemaFactory.createForClass(NativeCredentialRecord);

// Хеш уникален по построению (sha256 разных случайных 32 байт); индекс — по нему
// ищут bearer при каждом запросе и он же вторая линия обороны от дубля.
NativeCredentialSchema.index({ tokenHash: 1 }, { unique: true });
NativeCredentialSchema.index({ grantId: 1 });
NativeCredentialSchema.index({ userId: 1 });
NativeCredentialSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const NATIVE_CREDENTIAL_FIELD_POLICY: FieldPolicy = {
  tokenHash: plain('хеш, не восстанавливаемый текст; по нему ищут bearer при запросе'),
};
