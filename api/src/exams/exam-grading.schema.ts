// Оценка попытки по рубрике (`exam_gradings`, слой 4.6, PLAN §11, ADR-0022) —
// данные ученика: `userId` — кого проверили, владение (чеклист CLAUDE.md
// «Новая коллекция с полем userId», п.1) — USER_OWNED_COLLECTIONS, удаление
// аккаунта уносит и оценку; срок хранения — вместе с попыткой (PLAN §11
// «Данные»). `criteria` — снимок критериев рубрики на момент проверки со
// своими баллами и комментарием: свободный текст внутри, поэтому целиком
// строкой через `encJson`, тем же приёмом, что `blocks`/`options` у
// exam-attempt.schema.ts/exam-item.schema.ts — encryptRecord/decryptRecord
// шифруют только поля верхнего уровня документа, вложенный `comment` молча
// остался бы открытым текстом. `comment` (общий комментарий учителя) —
// отдельная строка верхнего уровня, шифруется как обычный свободный текст.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { GRADING_OUTCOMES } from '@xuanxue/shared';
import type { GradingOutcome } from '@xuanxue/shared';
import {
  enc,
  encJson,
  plain,
  encryptSchemaFrom,
  type FieldPolicy,
} from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

export interface GradingCriterionRecord {
  id: string;
  title: string;
  maxScore: number;
  score: number;
  comment?: string;
}

@Schema({ timestamps: true, collection: 'exam_gradings' })
export class ExamGradingRecord {
  // Идемпотентность PUT (ТЗ 4.6, п.2) — уникальный индекс ниже: одна оценка
  // на попытку, повтор переписывает, не плодит вторую запись. Без `ref`: не
  // ссылка на пользователя, ссылка на попытку (exam_attempts).
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  attemptId!: Types.ObjectId;

  // Денормализация ради фильтра учителя по форме (см. индекс ниже) — снимок
  // не устаревает: попытка не переезжает на другой экзамен после старта.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  examId!: Types.ObjectId;

  // Владение (чеклист CLAUDE.md, п.1) — ученик, чью работу проверили; по
  // этому полю уходит вместе с остальными данными ученика при удалении
  // аккаунта (USER_OWNED_COLLECTIONS). Не признак «кто проверял» — это
  // graderId ниже.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  // Кто проверил — ссылка, не признак владения (USER_REFERENCE_PATHS):
  // удаление аккаунта учителя обнуляет поле, оценка ученика остаётся.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: true })
  graderId!: Types.ObjectId;

  // Хранится строкой целиком (encJson) — см. комментарий в начале файла.
  @Prop({ type: String, default: '[]' })
  criteria!: string;

  @Prop({ type: String, required: false })
  comment?: string;

  @Prop({ type: String, enum: GRADING_OUTCOMES, required: true })
  outcome!: GradingOutcome;

  @Prop({ type: Date, required: true })
  gradedAt!: Date;
}

export const ExamGradingSchema = SchemaFactory.createForClass(ExamGradingRecord);
// Идемпотентность PUT /attempts/:id/grading (ТЗ 4.6, п.2, PLAN §11).
ExamGradingSchema.index({ attemptId: 1 }, { unique: true });
// Очередь/статистика учителя по форме, недавнее сверху.
ExamGradingSchema.index({ examId: 1, gradedAt: -1 });
// Экран ученика (`/me/exams`) — оценки по своим попыткам одним запросом.
ExamGradingSchema.index({ userId: 1 });

export const EXAM_GRADING_FIELD_POLICY: FieldPolicy = {
  criteria: encJson,
  comment: enc,
  outcome: plain('перечисление, нужно для выборок'),
};

/** Схема шифрования оценки — одна на все места чтения и записи
 * (ExamGradingsService, MyExamsService): читающий оценку мимо неё получит
 * шифротекст вместо баллов/комментария. */
export const EXAM_GRADING_ENCRYPT_SCHEMA = encryptSchemaFrom(EXAM_GRADING_FIELD_POLICY);
