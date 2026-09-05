// Конкретное занятие (данные школы, ADR-0009). `plannedAt` — identity для
// идемпотентной генерации из правила расписания (уникальный частичный
// индекс ниже); у разового занятия вне расписания его нет. `startsAt` —
// фактическое начало в UTC, меняется отдельно при переносе.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { LESSON_STATUSES, type LessonStatus } from '@xuanxue/shared';
import { enc, plain, type FieldPolicy } from '../common/field-policy';

// Запись занятия: ссылка (Drive, облако Zoom) или файл в Telegram по file_id.
@Schema({ _id: true })
class Recording {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: false })
  url?: string;

  @Prop({ type: String, required: false })
  telegramFileId?: string;
}
const RecordingSchema = SchemaFactory.createForClass(Recording);

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

  // Переопределение ведущего на одно занятие — появится вместе с моделью пользователей.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: false })
  leaderId?: Types.ObjectId;

  // Ссылка на конкретное правило класса (rules._id) — планировщик будущих PR
  // отличает «правило поменяли» от «правило удалили, новое добавили» без
  // сравнения полей вручную; у разового занятия отсутствует.
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
  // спрашивать на каждом тике планировщика (появится вместе с ботом учителя).
  @Prop({ type: Date, required: false })
  recordingPromptedAt?: Date;
}

export const LessonSchema = SchemaFactory.createForClass(LessonRecord);
LessonSchema.index({ classId: 1, startsAt: 1 });
LessonSchema.index({ startsAt: 1 });
// Второй тик планировщика не создаёт занятие повторно (ADR-0004 — та же
// идея, что у deliveries). Частичный: у разового занятия plannedAt нет.
LessonSchema.index(
  { classId: 1, plannedAt: 1 },
  { unique: true, partialFilterExpression: { plannedAt: { $type: 'date' } } },
);

export const LESSON_FIELD_POLICY: FieldPolicy = {
  topic: plain('публикуется в посте'),
  zoomLinkOverride: enc,
  zoomPasswordOverride: enc,
  note: enc,
  'recordings.title': plain('публикуется в посте'),
  // Риск утечки — просмотр записи прошедшего занятия, не вход на живое
  // (не входит в модель угроз SECURITY §1); принятый риск — SECURITY §11.
  'recordings.url': plain('ссылка на запись, принятый риск SECURITY §11'),
  'recordings.telegramFileId': plain('работает только у бота, снаружи бесполезен'),
};
