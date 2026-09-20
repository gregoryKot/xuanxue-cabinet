// Конкретное занятие (данные школы, ADR-0010). `plannedAt` — identity для
// идемпотентной генерации из правила расписания (уникальный частичный
// индекс ниже); у разового занятия вне расписания его нет. `startsAt` —
// фактическое начало в UTC, меняется отдельно при переносе.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { LESSON_STATUSES, type LessonStatus, type Recording } from '@xuanxue/shared';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ _id: true })
class RecordingSubdoc implements Recording {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: false })
  url?: string;

  @Prop({ type: String, required: false })
  telegramFileId?: string;
}
const RecordingSchema = SchemaFactory.createForClass(RecordingSubdoc);

@Schema({ timestamps: true, collection: 'lessons' })
export class LessonRecord {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  classId!: Types.ObjectId;

  @Prop({ type: Date, required: false })
  plannedAt?: Date;

  @Prop({ type: Date, required: true })
  startsAt!: Date;

  @Prop({ type: Number, required: true })
  durationMin!: number;

  @Prop({ type: String, default: '' })
  topic!: string;

  @Prop({ type: String, enum: LESSON_STATUSES, default: 'scheduled' })
  status!: LessonStatus;

  // См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  leaderId?: Types.ObjectId;

  // Ссылка на конкретное правило класса (rules._id) — планировщик отличает
  // «правило поменяли» от «правило удалили, новое добавили» без сравнения
  // полей вручную; у разового занятия отсутствует.
  @Prop({ type: SchemaTypes.ObjectId, required: false })
  ruleId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  zoomLinkOverride?: string;

  // Пароль разовой ссылки — не наследуется от zoomPassword класса, иначе в
  // пост уйдёт новая ссылка со старым паролем (см. PLAN §9: часть ссылок школы
  // без отдельного пароля, часть — с ним).
  @Prop({ type: String, required: false })
  zoomPasswordOverride?: string;

  @Prop({ type: [RecordingSchema], default: [] })
  recordings!: Recording[];

  @Prop({ type: String, required: false })
  note?: string;

  // Бот один раз спрашивает «Запись?» после занятия — отметка, чтобы не
  // спрашивать повторно на каждом тике планировщика.
  @Prop({ type: Date, required: false })
  recordingPromptedAt?: Date;

  // Рубрикация свободным текстом (ADR-0073, уточняет ADR-0058) — у даты
  // занятия, не у занятия расписания: тег описывает конкретный вечер, а не
  // постоянный признак курса. У дат, заведённых до этого поля, документ его
  // не содержит — `.lean()` не подставляет default при чтении (lesson.mapper.ts,
  // тот же приём, что у MaterialRecord.tags).
  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export const LessonSchema = SchemaFactory.createForClass(LessonRecord);
LessonSchema.index({ classId: 1, startsAt: 1 });
LessonSchema.index({ startsAt: 1 });
// Аудит L8: под фильтр планировщика рассылок (findDueLessons,
// broadcast-planner.queries.ts) — `{ status: 'scheduled', startsAt: {$gt,
// $lte} }` на каждом тике. При нынешних объёмах не заметно, но без индекса
// это full collection scan, растущий с историей занятий школы.
// syncIndexes() строит его на старте (api/src/database/index-sync.service.ts).
LessonSchema.index({ status: 1, startsAt: 1 });
// Второй тик планировщика не создаёт занятие повторно (ADR-0004 — та же
// идея, что у deliveries). Частичный: у разового занятия plannedAt нет.
LessonSchema.index(
  { classId: 1, plannedAt: 1 },
  { unique: true, partialFilterExpression: { plannedAt: { $type: 'date' } } },
);
// Фильтр по тегу (GET /api/lessons?tag=…, ADR-0073) — тот же приём, что у
// MaterialSchema.index({ tags: 1 }).
LessonSchema.index({ tags: 1 });

export const LESSON_FIELD_POLICY: FieldPolicy = {
  topic: plain('публикуется в посте'),
  zoomLinkOverride: enc,
  zoomPasswordOverride: enc,
  note: enc,
  'recordings.title': plain('публикуется в посте'),
  'recordings.url': plain('ссылка на запись, принятый риск SECURITY §11'),
  'recordings.telegramFileId': plain('работает только у бота, снаружи бесполезен'),
  tags: plain('рубрика занятия, фильтр и экран тега; не персональные данные'),
};

/** Схема шифрования занятия — та же причина, что у CLASS_ENCRYPT_SCHEMA:
 * разовая ссылка и заметка читаются в нескольких местах. */
export const LESSON_ENCRYPT_SCHEMA = encryptSchemaFrom(LESSON_FIELD_POLICY);
