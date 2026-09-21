// Заявка на одноразовый вход по email (SECURITY §2, ADR-0005, ADR-0029,
// ADR-0104): живёт EMAIL_LOGIN_TOKEN_TTL_MIN (email-login-token.service.ts),
// в базе — только sha256, сырые значения базу не видят. TTL-индекс на
// expiresAt подчищает протухшие сам; consume()/consumeCode() удаляют
// использованную явно (findOneAndDelete) — обычно TTL просто подметает то,
// чем никто не воспользовался за 15 минут.
//
// Одна заявка — один вход, выраженный двумя ключами (ADR-0104): ссылка
// (tokenHash) и код из письма (codeHash) тратят одну и ту же запись, потому
// что решают одну и ту же задачу — доставить сессию тому, кто открыл письмо,
// только с разных концов (ссылка удобна в браузере, код переносится руками
// в приложение на домашнем экране, у которого свои cookie). Потратили любой
// способ — сгорели оба: consume(token) и consumeCode(email, code) оба
// удаляют документ целиком, второй способ той же заявки перестаёт работать
// вместе с первым.
//
// retention: живёт до потребления или TTL-индекса, считаные минуты — короче
// сессии и вне модели угроз №2 (персональные данные учеников, SECURITY §1).
// Не в USER_OWNED_COLLECTIONS (CLAUDE.md «Новая коллекция»): у документа
// нет userId — ключ входа email, не аккаунт, и до верификации аккаунта
// может ещё не существовать вовсе. Решение зафиксировано здесь, а не
// молчаливым пропуском реестра.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'email_login_tokens' })
export class EmailLoginTokenRecord {
  @Prop({ type: String, required: true, lowercase: true })
  email!: string;

  @Prop({ type: String, required: true })
  tokenHash!: string;

  // sha256(code), тем же приёмом, что tokenHash — сырой код из письма базу
  // не видит. Индекса по этому полю нет: шесть цифр не уникальны на всю
  // школу (в отличие от tokenHash, случайных 32 байт), запись ищут по email,
  // а не по коду (consumeCode()).
  @Prop({ type: String, required: true })
  codeHash!: string;

  // Счётчик попыток ввода кода — растёт на каждый вызов consumeCode() ДО
  // сравнения хешей (SECURITY §2: иначе перебор шести цифр бесплатен),
  // исчерпанный лимит сжигает всю заявку (email-login-token.service.ts).
  @Prop({ type: Number, required: true, default: 0 })
  attempts!: number;

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
  codeHash: plain('хеш, не восстанавливаемый текст'),
};
