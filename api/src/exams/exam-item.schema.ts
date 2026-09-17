// Вопрос банка (ADR-0022, PLAN §11 слой 4.2) — данные школы (ADR-0010):
// доступ по роли teacher/admin, не по владельцу. `options` и `history` —
// свободный текст (формулировка варианта, отметка «верно», архивные
// формулировки/критерии): шифруются целиком как JSON-строка (`encJson`),
// как `channels.config` (channel.schema.ts) — так велит комментарий в
// `field-policy.ts`. Субдокумент со своим `_id` (как ScheduleRuleSubdoc у
// занятий) здесь не годится: encryptRecord/decryptRecord (utils/encryption.ts)
// шифруют только поля верхнего уровня документа, и текст варианта остался бы
// в открытом виде молча — encryption-coverage.spec.ts прямо запрещает
// enc/encJson на вложенном пути ровно по этой причине. `id` варианта сервис
// генерирует сам (mapOptions, exam-item-options.ts) — на него сошлётся снимок
// формы в попытке экзамена (слой 4.4).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_ITEM_KINDS, EXAM_ITEM_STATUSES } from '@xuanxue/shared';
import type { ExamItemKind, ExamItemStatus } from '@xuanxue/shared';
import {
  enc,
  encJson,
  plain,
  encryptSchemaFrom,
  type FieldPolicy,
} from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

export interface ExamItemOptionRecord {
  id: string;
  text: string;
  correct: boolean;
  /** Ссылка на картинку в `exam_images` (ADR-0035) — необязательна: у
   * варианта хотя бы одно из text/imageId, проверяет assertOptionsForKind. */
  imageId?: string;
}

/** Прошлая редакция — снимок содержательных полей на момент правки
 * опубликованного вопроса (ТЗ 4.2, п.3). `replacedAt` — строка ISO, не
 * `Date`: весь объект — часть JSON внутри зашифрованного `history`
 * (encryptJson/decryptJson, utils/encryption.ts), не своя ветка схемы. */
export interface ExamItemVersionRecord {
  version: number;
  prompt: string;
  hint?: string;
  criteria?: string;
  options: ExamItemOptionRecord[];
  replacedAt: string;
}

@Schema({ timestamps: true, collection: 'exam_items' })
export class ExamItemRecord {
  // Тип не входит в PATCH (UpdateExamItemInput, shared/src/exams.ts) — смена
  // типа значит завести новый вопрос, ТЗ 4.2 п.1.
  @Prop({ type: String, enum: EXAM_ITEM_KINDS, required: true })
  kind!: ExamItemKind;

  @Prop({ type: String, required: true })
  prompt!: string;

  @Prop({ type: String, required: false })
  hint?: string;

  @Prop({ type: String, required: false })
  criteria?: string;

  // Хранится строкой целиком (encJson) — см. комментарий в начале файла.
  @Prop({ type: String, default: '[]' })
  options!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  // По умолчанию вопрос сразу годен к сборке формы (ADR-0033): владелец
  // создал вопросы и не нашёл их в конструкторе — шаг «опубликовать» был
  // лишним. `draft` остаётся осознанным выбором «спрятать» — его шлёт
  // создание с явным статусом или кнопка статуса на экране.
  @Prop({ type: String, enum: EXAM_ITEM_STATUSES, default: 'published' })
  status!: ExamItemStatus;

  @Prop({ type: Number, default: 1 })
  version!: number;

  // Хранится строкой целиком (encJson) — см. комментарий в начале файла.
  @Prop({ type: String, default: '[]' })
  history!: string;

  // Плоская копия imageId вариантов (текущих и из history) — options/history
  // зашифрованы целиком и Mongo внутрь не видит; по этому полю уборщик сирот
  // (exam-image-sweep.service.ts) поймёт, на какие картинки ссылается вопрос
  // (ADR-0035). Пишет ExamItemsService (create/update, collectImageIds) — у
  // старых документов поля нет, Mongo трактует отсутствие как пустой массив.
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  imageIds!: Types.ObjectId[];

  // Кто создал — не признак владения (данные школы, ADR-0010), просто
  // ссылка. См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  authorId?: Types.ObjectId;
}

export const ExamItemSchema = SchemaFactory.createForClass(ExamItemRecord);
// Список экрана «Вопросы»: фильтр по статусу, сортировка по недавней правке.
ExamItemSchema.index({ status: 1, updatedAt: -1 });
// Фильтр по тегу (раздел программы, уровень).
ExamItemSchema.index({ tags: 1 });
// Уборщик сирот (ADR-0035) — какие картинки ещё используются вопросами.
ExamItemSchema.index({ imageIds: 1 });

export const EXAM_ITEM_FIELD_POLICY: FieldPolicy = {
  prompt: enc,
  hint: enc,
  criteria: enc,
  options: encJson,
  history: encJson,
  tags: plain('раздел программы, фильтр в списке; не персональные данные'),
  kind: plain('перечисление, нужно для выборок'),
  status: plain('перечисление, нужно для выборок'),
};

/** Схема шифрования вопроса — одна на все места чтения и записи (сервис,
 * будущий конструктор экзамена и снимок попытки): читающий вопрос мимо неё
 * получит шифротекст вместо формулировки. */
export const EXAM_ITEM_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_ITEM_FIELD_POLICY);
