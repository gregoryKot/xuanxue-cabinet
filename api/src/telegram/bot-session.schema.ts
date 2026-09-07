// Ожидание бота в личном чате учителя — «жду тему» после кнопки «Изменить
// тему»/команды /тема, «жду запись» после «Занятие закончилось» (PLAN.md §6).
// Один активный документ на чат (уникальный индекс `chatId`): новое ожидание
// вытесняет старое — учитель отвечает на последнее, что видит. TTL-индекс на
// `expiresAt` — Mongo сама подчищает истёкшие ожидания, раннер бота не
// обязан помнить про них сам.
//
// Не про пользователя школы (userId нет — не в USER_OWNED_COLLECTIONS,
// CLAUDE.md «Новая коллекция с полем userId»): ключ — chatId Telegram,
// живёт минуты-часы, персональных данных не содержит.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import type { FieldPolicy } from '../common/field-policy';

const BOT_SESSION_KINDS = ['topic', 'recording'] as const;
export type BotSessionKind = (typeof BOT_SESSION_KINDS)[number];

@Schema({ timestamps: true, collection: 'bot_sessions' })
export class BotSessionRecord {
  // Telegram chatId личного чата — число (может быть отрицательным у групп,
  // но ожидание темы/записи заводится только в личном чате учителя).
  @Prop({ type: Number, required: true })
  chatId!: number;

  @Prop({ type: String, enum: BOT_SESSION_KINDS, required: true })
  kind!: BotSessionKind;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  lessonId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;
}

export const BotSessionSchema = SchemaFactory.createForClass(BotSessionRecord);
BotSessionSchema.index({ chatId: 1 }, { unique: true });
// expireAfterSeconds: 0 — Mongo удаляет документ в момент, записанный в самом
// поле (не через N секунд после createdAt), TTL-монитор проверяет раз в
// минуту (SERVER-заявленная точность MongoDB, не наша).
BotSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BOT_SESSION_FIELD_POLICY: FieldPolicy = {
  // kind — перечисление (enum), решения не требует (encryption-coverage.spec).
  // chatId — Number, тоже вне охвата String/Mixed; причина здесь для чеклиста
  // CLAUDE.md «Новая коллекция»: id чата Telegram — не секрет и не текст.
};
