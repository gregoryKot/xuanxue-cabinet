// Ожидание бота в личном чате учителя — «жду тему» после кнопки «Изменить
// тему»/команды /тема, «жду запись» после «Занятие закончилось» (PLAN.md §6).
// Один активный документ на чат (уникальный индекс `chatId`): новое ожидание
// вытесняет старое — учитель отвечает на последнее, что видит. TTL-индекс на
// `expiresAt` — Mongo сама подчищает истёкшие ожидания, раннер бота не
// обязан помнить про них сам.
//
// Не про пользователя школы (userId нет — не в USER_OWNED_COLLECTIONS,
// CLAUDE.md «Новая коллекция»): ключ — chatId Telegram, живёт минуты-часы,
// персональных данных не содержит.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import {
  EXAM_ITEM_KINDS,
  GRADING_OUTCOMES,
  type ExamItemKind,
  type GradingOutcome,
} from '@xuanxue/shared';
import {
  enc,
  encJson,
  encryptSchemaFrom,
  plain,
  type FieldPolicy,
} from '../common/field-policy';
import { BOT_SESSION_KINDS, type BotSessionKind } from './bot-session-kind';

export type { BotSessionKind };

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

// Шаг диалога сборки экзамена (ТЗ 4б.4) — 'pick' заводится сразу командой
// /экзамен (в отличие от examItemDraft, где до первой записи есть безсессионный
// screen 1): отметки копятся в bot_sessions с первого сообщения, второй
// инстанс при деплое должен их видеть.
const NEW_EXAM_STEPS = [
  'pick',
  'title',
  'timeLimit',
  'attempts',
  'dueAt',
  'confirm',
] as const;
export type NewExamStep = (typeof NEW_EXAM_STEPS)[number];

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

  // Только 'payment' (ADR-0050, docs/PLAN.md §15 слой 2.2) — месяц скриншота
  // из deep link `t.me/<бот>?start=pay_<YYYY-MM>`. `null`, не просто
  // отсутствие поля, при переключении на другой вид ожидания того же чата —
  // та же причина, что у questionIndex/itemId выше: иначе месяц от прошлого
  // захода пережил бы переключение на другой deep link (payment-wait.ts).
  @Prop({ type: String, required: false })
  month?: string | null;

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

  // Только 'examBuildDraft' — шаг диалога сборки (комментарий у kind выше),
  // enum, решения по шифрованию не требует.
  @Prop({ type: String, enum: NEW_EXAM_STEPS, required: false })
  buildStep?: NewExamStep;

  // Отмеченные вопросы — порядок отметки становится порядком вопросов формы
  // (единственный блок, ADR-0033). Ссылки на уже опубликованные exam_items,
  // не персональные данные — решения по шифрованию не требует.
  @Prop({ type: [SchemaTypes.ObjectId], required: false })
  buildItemIds?: Types.ObjectId[];

  // Текущая страница списка вопросов на шаге 'pick' — не текст и не секрет.
  @Prop({ type: Number, required: false })
  buildPage?: number;

  // Название формы — свободный текст, шифруется тем же приёмом, что draftPrompt.
  @Prop({ type: String, required: false })
  buildTitle?: string;

  // Лимит времени в минутах — отсутствие поля к шагу 'attempts' и позже
  // значит «без лимита» (шаг решил вопрос раньше, чем поле появилось бы).
  @Prop({ type: Number, required: false })
  buildTimeLimitMin?: number;

  @Prop({ type: Number, required: false })
  buildAttemptsAllowed?: number;

  // Срок сдачи (ADR-0125) — отсутствие поля к шагу 'confirm' и позже значит
  // «без срока», тем же приёмом, что buildTimeLimitMin выше. ISO UTC с Z
  // (как CreateExamInput.dueAt, shared/src/exams.ts) — дата, не свободный
  // текст, решения по шифрованию не требует (CLAUDE.md «Не шифровать: id,
  // userId, даты, перечисления»).
  @Prop({ type: String, required: false })
  buildDueAt?: string;

  // Идемпотентность «Опубликовать» (ТЗ 4б.4) — id уже созданной формы.
  // Повторный клик находит его здесь и не зовёт ExamsService.createAndPublishExam
  // второй раз (new-exam-save.ts). Ссылка на уже существующий exams, не
  // персональные данные — решения по шифрованию не требует.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  buildSavedExamId?: Types.ObjectId;

  // Только 'gradeComment' (ТЗ 4б.5) — итог, который выбрал проверяющий,
  // запоминаем на сессии, чтобы не спрашивать его снова после комментария.
  // enum, решения по шифрованию не требует.
  @Prop({ type: String, enum: GRADING_OUTCOMES, required: false })
  outcome?: GradingOutcome;
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
  buildTitle: enc,
  buildDueAt: plain(
    'срок сдачи черновика — дата, не свободный текст (CLAUDE.md «Не шифровать: id, userId, даты, перечисления»)',
  ),
  month: plain(
    'месяц скриншота оплаты — ключ формата YYYY-MM (ADR-0050), не свободный текст, как month у payments (SECURITY §5)',
  ),
};

/** Схема шифрования черновика вопроса — одна на запись и чтение
 * (bot-session.service.ts), тем же приёмом, что EXAM_ITEM_ENCRYPT_SCHEMA у
 * самого банка вопросов (exam-item.schema.ts). */
export const BOT_SESSION_ENCRYPT_SCHEMA = encryptSchemaFrom(BOT_SESSION_FIELD_POLICY);
