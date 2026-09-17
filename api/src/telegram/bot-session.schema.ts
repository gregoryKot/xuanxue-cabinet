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
import { EXAM_ITEM_KINDS, type ExamItemKind } from '@xuanxue/shared';
import {
  enc,
  encJson,
  encryptSchemaFrom,
  type FieldPolicy,
} from '../common/field-policy';

// 'examMedia' (ADR-0023, PLAN §11 слой 4.5) — ждём видео для попытки; либо
// после deep link `t.me/<бот>?start=exam_<attemptId>` из кабинета (тогда
// `questionIndex` не задан), либо с экрана вопроса-видео внутри самого бота
// (ТЗ 4б.2, часть 2 — `questionIndex` задан, после привязки бот сразу
// показывает следующий вопрос). В отличие от topic/recording заводится
// ЛЮБОМУ пользователю Telegram, не только штату школы (экзамен сдают
// ученики) — несёт `attemptId`, не `lessonId`.
// 'examText' (ТЗ 4б.2, часть 2) — ждём свободный текст ответа на вопрос
// попытки; всегда с `questionIndex`, тем же приёмом, что examMedia.
// 'examItemDraft' (ТЗ 4б.3, PLAN.md §12, ADR-0024) — учитель заводит вопрос в
// боте: четыре шага (тип → формулировка → варианты → критерии), черновик
// копится в draft*-полях ниже, а не в отдельной коллекции — тем же приёмом,
// что topic/recording хранят `lessonId` прямо на сессии. Открыт только штату
// (personal-chats.ts), в отличие от examMedia/examText.
const BOT_SESSION_KINDS = [
  'topic',
  'recording',
  'examMedia',
  'examText',
  'examItemDraft',
] as const;
export type BotSessionKind = (typeof BOT_SESSION_KINDS)[number];

// Шаг диалога заведения вопроса (ТЗ 4б.3) — 'kind' на схеме нет: тип выбирают
// кнопкой ДО первой записи в bot_sessions (new-exam-item-screens.ts), сессия
// заводится только с шага 'prompt'. 'options'/'correct' пропускаются у
// text/video (у них вариантов не бывает, exam-item-options.ts) — сразу
// 'prompt' → 'criteria'.
const NEW_EXAM_ITEM_STEPS = [
  'prompt',
  'options',
  'correct',
  'criteria',
  'confirm',
] as const;
export type NewExamItemStep = (typeof NEW_EXAM_ITEM_STEPS)[number];

@Schema({ timestamps: true, collection: 'bot_sessions' })
export class BotSessionRecord {
  // Telegram chatId личного чата — число (может быть отрицательным у групп,
  // но ожидание темы/записи заводится только в личном чате учителя).
  @Prop({ type: Number, required: true })
  chatId!: number;

  @Prop({ type: String, enum: BOT_SESSION_KINDS, required: true })
  kind!: BotSessionKind;

  // Только 'topic'/'recording'. Не $unset при переключении на 'examMedia' и
  // обратно (см. bot-session.service.ts) — читатели ветвятся по `kind`
  // раньше, чем смотрят на lessonId/attemptId, поэтому лишнее поле от
  // прошлого ожидания безвредно.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  lessonId?: Types.ObjectId;

  // Только 'examMedia'/'examText'.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  attemptId?: Types.ObjectId;

  // Номер вопроса в снимке попытки (attempt.blocks[].questions[], НЕ itemId —
  // exam-callback-ids.ts объясняет, почему номером), не своим id: всегда у
  // 'examText', у 'examMedia' — только когда вопрос открыт из потока вопросов
  // бота, а не по deep link из кабинета (см. комментарий у kind выше).
  // `null`, не просто отсутствие поля, у 'examMedia' без вопроса — иначе
  // старый номер вопроса пережил бы переключение с потока бота на deep link
  // того же чата (bot-session.service.ts, startExamMediaWait).
  @Prop({ type: Number, required: false })
  questionIndex?: number | null;

  // Вопрос-видео, которому станет ответом присланное видео (ADR-0037) — есть
  // только у 'examMedia': из deep link `exam_<attemptId>_<itemId>` (тогда
  // questionIndex не задан) либо из самого вопроса потока бота — берётся
  // готовым (`question.itemId`), а не пересчитывается по questionIndex.
  // `null`, тем же приёмом и по той же причине, что questionIndex выше.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  itemId?: Types.ObjectId | null;

  @Prop({ type: Date, required: true })
  expiresAt!: Date;

  // Только 'examItemDraft' — шаг диалога (bot-session.schema.ts комментарий
  // у kind выше), enum, решения по шифрованию не требует.
  @Prop({ type: String, enum: NEW_EXAM_ITEM_STEPS, required: false })
  draftStep?: NewExamItemStep;

  // Тип вопроса, выбранный на первом (безсессионном) шаге — тот же enum, что
  // у банка вопросов (exam-item.schema.ts), решения не требует.
  @Prop({ type: String, enum: EXAM_ITEM_KINDS, required: false })
  draftKind?: ExamItemKind;

  // Свободный текст формулировки — шифруется (SECURITY §5), как prompt у
  // самого вопроса.
  @Prop({ type: String, required: false })
  draftPrompt?: string;

  // Критерии проверки (шаг необязательный) — шифруются тем же приёмом.
  @Prop({ type: String, required: false })
  draftCriteria?: string;

  // Варианты ответа, накопленные на шаге 'options' — JSON-строка целиком
  // (encJson), как options у самого вопроса (exam-item.schema.ts):
  // вложенное enc/encJson не сработает молча (encryption-coverage.spec.ts).
  @Prop({ type: String, required: false })
  draftOptions?: string;

  // Идемпотентность «Сохранить» (ТЗ 4б.3) — id уже созданного вопроса.
  // Повторный клик находит его здесь и не зовёт ExamItemsService.create()
  // второй раз (new-exam-item-save.ts). Не пользовательский ObjectId данных —
  // ссылка на уже существующий exam_items, решения по шифрованию не требует.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  draftSavedItemId?: Types.ObjectId;
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
  draftPrompt: enc,
  draftCriteria: enc,
  draftOptions: encJson,
};

/** Схема шифрования черновика вопроса — одна на запись и чтение
 * (bot-session.service.ts), тем же приёмом, что EXAM_ITEM_ENCRYPT_SCHEMA у
 * самого банка вопросов (exam-item.schema.ts). */
export const BOT_SESSION_ENCRYPT_SCHEMA = encryptSchemaFrom(BOT_SESSION_FIELD_POLICY);
