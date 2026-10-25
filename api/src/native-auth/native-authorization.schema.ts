// Попытка входа нативного Daychi и её код — одна запись (ADR-0181, профиль
// Workshop 3c98d4a, «Accepted pending browser authorization protection»).
// Завершение попытки и выдача кода — один `findOneAndUpdate` по этой записи:
// разнеси их по двум документам, и «не больше одного кода на попытку» пришлось
// бы держать транзакцией. Параметры запроса Daychi хранятся здесь, а не в
// cookie или адресе: продолжение берёт их только из записи.
//
// Браузер несёт лишь привязку `native_authz` (native-authz-cookie.ts), в базе —
// её sha256; код — тоже только sha256. Отказ после срока дают проверки
// `expiresAt > now` и `codeExpiresAt > now` в сервисе, а не TTL.
//
// retention: 900 секунд попытки плюс 60 секунд кода от создания — `purgeAt`,
// запись убирает TTL-индекс. userId — чей аккаунт завершил попытку, поэтому
// модель во USER_OWNED_COLLECTIONS: удаление аккаунта уносит и незабранный код.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'native_authorizations' })
export class NativeAuthorizationRecord {
  @Prop({ type: String, required: true })
  issuer!: string;

  @Prop({ type: String, required: true })
  clientId!: string;

  @Prop({ type: String, required: true })
  redirectUri!: string;

  @Prop({ type: String, required: true })
  scope!: string;

  @Prop({ type: String, required: true })
  state!: string;

  @Prop({ type: String, required: true })
  codeChallenge!: string;

  @Prop({ type: String, required: true })
  bindingHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId })
  userId?: Types.ObjectId;

  @Prop({ type: String })
  codeHash?: string;

  @Prop({ type: Date })
  codeExpiresAt?: Date;

  @Prop({ type: Date })
  codeConsumedAt?: Date;

  @Prop({ type: Date, required: true })
  purgeAt!: Date;
}

export const NativeAuthorizationSchema = SchemaFactory.createForClass(
  NativeAuthorizationRecord,
);

// По хешу кода ищет обмен. Частичный: у попытки без кода (ещё не завершена или
// отменена) поля нет, а уникальность нужна только среди выданных кодов.
NativeAuthorizationSchema.index(
  { codeHash: 1 },
  { unique: true, partialFilterExpression: { codeHash: { $type: 'string' } } },
);
NativeAuthorizationSchema.index({ userId: 1 });
// expireAfterSeconds: 0 — Mongo удаляет документ в момент, записанный в поле.
NativeAuthorizationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const FROM_PROFILE =
  'значение из профиля Workshop или запроса Daychi, не данные человека';

export const NATIVE_AUTHORIZATION_FIELD_POLICY: FieldPolicy = {
  issuer: plain('адрес самого кабинета (PUBLIC_URL), не данные человека'),
  clientId: plain(FROM_PROFILE),
  redirectUri: plain(FROM_PROFILE),
  scope: plain(FROM_PROFILE),
  state: plain('случайное значение Daychi, его же браузер получает в callback'),
  codeChallenge: plain('sha256 от verifier Daychi, сверяется при обмене кода'),
  bindingHash: plain('хеш привязки браузера, не восстанавливаемый текст'),
  codeHash: plain('хеш кода, не восстанавливаемый текст; по нему ищет обмен'),
};
