// Форма экзамена, собранная из вопросов банка (ADR-0022 + дополнение
// 2026-09-12, PLAN §11 слой 4.3) — данные школы (ADR-0010): доступ по роли
// teacher/admin, не по владельцу. Форма ссылается на вопрос только по
// `itemId`, БЕЗ номера версии — редакцию закрепляет попытка в момент старта
// (слой 4.4): дополнение к ADR-0022 прямо запрещает фиксировать версию
// здесь, иначе правка опечатки в вопросе не доедет ни до одного экзамена.
// `blocks` — свободный текст (заголовок блока) внутри, поэтому целиком
// строкой через `encJson`, тем же приёмом, что `options`/`history` у
// exam-item.schema.ts: encryptRecord/decryptRecord шифруют только поля
// верхнего уровня, а вложенный `title` молча остался бы открытым текстом.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_STATUSES } from '@xuanxue/shared';
import type { ExamStatus } from '@xuanxue/shared';
import {
  enc,
  encJson,
  plain,
  encryptSchemaFrom,
  type FieldPolicy,
} from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

/** Блок формы как он хранится в базе (внутри `blocks`, строка JSON) — `id`
 * генерирует сервис (keepOrGenerateId, sub-id.ts), как `id` варианта вопроса
 * (ExamItemOptionRecord, exam-item.schema.ts). Форма совпадает с
 * `ExamBlockDto` из shared. */
export interface ExamBlockRecord {
  id: string;
  title: string;
  itemIds: string[];
  shuffle: boolean;
  /** Сколько вопросов из `itemIds` достаётся сдающему в одной попытке —
   * случайная выборка при старте (ADR-0082). Нет поля — все вопросы списка.
   * Живёт внутри зашифрованного `blocks` (encJson выше) — отдельной записи в
   * EXAM_FIELD_POLICY не требует. */
  questionsPerAttempt?: number;
  /** Вопросы, которые попадают каждому сдающему при выборке (ADR-0082,
   * дополнение) — подмножество `itemIds`, другая вещь, чем историческое
   * `required` ниже (метка блока целиком, ADR-0033, мертва). Живёт внутри
   * зашифрованного `blocks` (encJson выше) — отдельной записи в
   * EXAM_FIELD_POLICY не требует. */
  requiredItemIds?: string[];
  /** Историческое, в контракт не отдаётся (ADR-0033: «Блок обязателен» ни на
   * что не влияло) — старые документы его хранят, переписывать их незачем:
   * `blocks` зашифрован целиком, а следующее сохранение формы уберёт поле
   * само (mapBlocks его больше не пишет). */
  required?: boolean;
}

// Экспортирован — тем же значением пользуется миграция 0013-exam-form-1:
// пишет документ сырым драйвером, без схемных default, и не должна заводить
// вторую копию той же цифры (CLAUDE.md «Без магических чисел и строк»).
export const DEFAULT_ATTEMPTS_ALLOWED = 1;

@Schema({ timestamps: true, collection: 'exams' })
export class ExamRecord {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  description!: string;

  @Prop({ type: String, default: '' })
  level!: string;

  // Хранится строкой целиком (encJson) — см. комментарий в начале файла.
  @Prop({ type: String, default: '[]' })
  blocks!: string;

  // Перемешивать варианты ответа внутри вопроса у каждого сдающего
  // (ADR-0033). Перемешивание вопросов живёт у блока (`blocks[].shuffle`), а
  // это — у формы: вариантами оно распоряжается одинаково по всему экзамену.
  @Prop({ type: Boolean, default: false })
  shuffleOptions!: boolean;

  @Prop({ type: Number, required: false })
  timeLimitMin?: number;

  // Срок сдачи — второе, независимое от timeLimitMin ограничение (ADR-0125):
  // до какого момента можно начать НОВУЮ попытку, а не сколько она длится.
  @Prop({ type: Date, required: false })
  dueAt?: Date;

  @Prop({ type: Number, default: DEFAULT_ATTEMPTS_ALLOWED })
  attemptsAllowed!: number;

  @Prop({ type: String, enum: EXAM_STATUSES, default: 'draft' })
  status!: ExamStatus;

  // Кто создал — не признак владения (данные школы, ADR-0010), просто
  // ссылка, при правке не меняется. См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;
}

export const ExamSchema = SchemaFactory.createForClass(ExamRecord);
// Экран «Экзамены»: фильтр по статусу, сортировка по недавней правке.
ExamSchema.index({ status: 1, updatedAt: -1 });
// Фильтр по уровню.
ExamSchema.index({ level: 1 });

export const EXAM_FIELD_POLICY: FieldPolicy = {
  title: enc,
  description: enc,
  blocks: encJson,
  level: plain('фильтр в списке; не персональные данные'),
  status: plain('перечисление, нужно для выборок'),
  shuffleOptions: plain('флаг, не персональные данные'),
};

/** Схема шифрования формы — одна на все места чтения и записи (сервис,
 * будущий снимок попытки экзамена): читающий форму мимо неё получит
 * шифротекст вместо названия/описания. */
export const EXAM_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_FIELD_POLICY);
