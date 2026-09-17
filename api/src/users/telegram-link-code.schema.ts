// Код связки Telegram с уже существующим аккаунтом (ADR-0034,
// shared/src/telegram-link.ts): вошедший по почте (ADR-0029) получает
// одноразовый код, уходит в чат с ботом по `t.me/<бот>?start=link_<код>`,
// бот по коду ставит `telegramId` (telegram-link.service.ts). В базе —
// только sha256(code) (telegram-link-code.service.ts), сырой код базу не
// видит. TTL-индекс на expiresAt подчищает протухшие сам; consume()
// удаляет использованный явно (findOneAndDelete) — тот же приём, что у
// email_login_tokens (email-login-token.schema.ts).
//
// retention: живёт до потребления или TTL-индекса, считаные минуты — короче
// сессии и вне модели угроз №2 (персональные данные учеников, SECURITY §1).
//
// userId — владелец кода, чья сессия его выпустила: это признак владения
// (чеклист CLAUDE.md «Новая коллекция с полем userId»), поэтому модель
// внесена в USER_OWNED_COLLECTIONS (user-data.registry.ts) — сверочный spec
// падает, если модель с путём userId забыта там.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'telegram_link_codes' })
export class TelegramLinkCodeRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true })
  codeHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export const TelegramLinkCodeSchema =
  SchemaFactory.createForClass(TelegramLinkCodeRecord);

// Один активный код на человека — issueLink() удаляет прежние перед
// вставкой нового (telegram-link-code.service.ts), индекс не unique: гонка
// двух одновременных issueLink() для одного userId не должна падать 500.
TelegramLinkCodeSchema.index({ userId: 1 });
// Хеш — по построению уникален (sha256 разных случайных 16 байт), но индекс
// unique — вторая линия обороны, тот же приём, что у email_login_tokens.
TelegramLinkCodeSchema.index({ codeHash: 1 }, { unique: true });
// expireAfterSeconds: 0 — Mongo удаляет документ в момент, записанный в
// самом поле, тот же приём, что у email_login_tokens/bot_sessions.
TelegramLinkCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const TELEGRAM_LINK_CODE_FIELD_POLICY: FieldPolicy = {
  codeHash: plain('хеш, не восстанавливаемый текст'),
};
