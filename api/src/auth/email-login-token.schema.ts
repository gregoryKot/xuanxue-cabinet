// Токен одноразовой ссылки на email (SECURITY §2, ADR-0005, ADR-0029): живёт
// EMAIL_LOGIN_TOKEN_TTL_MIN (email-login-token.service.ts), в базе — только
// sha256(token), сырой токен базу не видит. TTL-индекс на expiresAt
// подчищает протухшие сам; consume() удаляет использованный явно
// (findOneAndDelete) — обычно TTL просто подметает то, чем никто не
// воспользовался за 15 минут.
//
// retention: живёт до потребления или TTL-индекса, считаные минуты — короче
// сессии и вне модели угроз №2 (персональные данные учеников, SECURITY §1).
// Не в USER_OWNED_COLLECTIONS (CLAUDE.md «Новая коллекция с полем userId»):
// у документа нет userId — ключ входа email, не аккаунт, и до верификации
// аккаунта может ещё не существовать вовсе. Решение зафиксировано здесь, а
// не молчаливым пропуском реестра.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'email_login_tokens' })
export class EmailLoginTokenRecord {
  @Prop({ type: String, required: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true })
  tokenHash!: string;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export const EmailLoginTokenSchema = SchemaFactory.createForClass(EmailLoginTokenRecord);

// Один активный токен на email — issue() удаляет прежние перед вставкой
// нового (email-login-token.service.ts), индекс не unique: гонка двух
// одновременных issue() для одного email не должна падать 500 пользователю.
EmailLoginTokenSchema.index({ email: 1 });
// Хеш — по построению уникален (sha256 разных случайных 32 байт), но индекс
// unique — вторая линия обороны: коллизия здесь означала бы, что два разных
// письма ведут на один и тот же вход, чего не должно случиться никогда.
EmailLoginTokenSchema.index({ tokenHash: 1 }, { unique: true });
// expireAfterSeconds: 0 — Mongo удаляет документ в момент, записанный в самом
// поле (не через N секунд после createdAt), TTL-монитор проверяет раз в
// минуту (SERVER-заявленная точность MongoDB, не наша) — тот же приём, что у
// bot_sessions (bot-session.schema.ts).
EmailLoginTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EMAIL_LOGIN_TOKEN_FIELD_POLICY: FieldPolicy = {
  email: plain('ключ поиска при входе, как в users'),
  tokenHash: plain('хеш, не восстанавливаемый текст'),
};
