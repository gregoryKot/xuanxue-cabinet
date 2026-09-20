// Токен подтверждения привязки почты к уже вошедшему человеку (ADR-0059,
// email-link.service.ts) — отдельная коллекция от email_login_tokens
// (../auth/email-login-token.schema.ts), не то же хранилище с полем
// «назначение». У токена входа ключ документа — email, userId нет вовсе, и
// он нарочно НЕ в USER_OWNED_COLLECTIONS; у токена подтверждения есть
// владелец-аккаунт (userId), и он обязан быть в реестре
// (user-data.registry.ts). Смешай оба вида токенов в одной коллекции — и
// каждый запрос был бы обязан помнить фильтр по назначению: забытый фильтр
// превратил бы ссылку подтверждения в ключ входа, ровно то, от чего
// защищаемся (SECURITY §2). Разные коллекции нельзя перепутать по
// построению — в этом весь смысл разделения.
//
// retention: живёт до потребления (consume) или TTL-индекса — считаные
// минуты, короче сессии и вне модели угроз №2 (SECURITY §1).
//
// userId — чья сессия привязывает адрес, признак владения (чеклист CLAUDE.md
// «Новая коллекция с полем userId») — модель внесена в USER_OWNED_COLLECTIONS
// рядом с TelegramLinkCodeRecord, тем же доводом: сверочный тест падает,
// если модель с путём userId забыта там.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'email_link_tokens' })
export class EmailLinkTokenRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export const EmailLinkTokenSchema = SchemaFactory.createForClass(EmailLinkTokenRecord);

// Один активный токен на человека — issue() удаляет прежние перед вставкой
// нового (email-link-token.service.ts), индекс не unique: гонка двух
// одновременных issue() для одного userId не должна падать 500.
EmailLinkTokenSchema.index({ userId: 1 });
// Хеш — по построению уникален (sha256 разных случайных 32 байт), но индекс
// unique — вторая линия обороны, тот же приём, что у email_login_tokens.
EmailLinkTokenSchema.index({ tokenHash: 1 }, { unique: true });
// expireAfterSeconds: 0 — Mongo удаляет документ в момент, записанный в самом
// поле, тот же приём, что у email_login_tokens/telegram_link_codes.
EmailLinkTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EMAIL_LINK_TOKEN_FIELD_POLICY: FieldPolicy = {
  email: plain('ключ поиска при подтверждении, как в users'),
  tokenHash: plain('хеш, не восстанавливаемый текст'),
};
