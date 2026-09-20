// Слот расписания школы — данные школы, не пользователя (ADR-0010): доступ
// по роли teacher/admin, не по владельцу. leaderId — кто ведёт (подстановка
// «{ведущий}», фильтр «мои»), не признак владения документом.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import {
  CLASS_FORMATS,
  DEFAULT_LEAD_MINUTES,
  RULE_TIME_RE,
  SCHOOL_TZ,
  WEEKDAYS,
  type ClassFormat,
  type ScheduleRule,
  type Weekday,
} from '@xuanxue/shared';
import { enc, encryptSchemaFrom, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

// Субдокумент правила расписания. `_id` НЕ отключён (Mongoose даёт его
// бесплатно) — планировщик ссылается на конкретное правило
// (`lessons.ruleId`), чтобы отличить «время правила поменяли» от «правило
// удалили, добавили новое», не сравнивая поля вручную.
@Schema({ _id: true })
class ScheduleRuleSubdoc implements ScheduleRule {
  @Prop({ type: Number, enum: WEEKDAYS, required: true })
  weekday!: Weekday;

  @Prop({ type: String, required: true, match: RULE_TIME_RE })
  time!: string;

  @Prop({ type: Number, required: true })
  durationMin!: number;
}
const ScheduleRuleSchema = SchemaFactory.createForClass(ScheduleRuleSubdoc);

/** Правило расписания как его отдаёт `.lean()` — Mongoose не снимает `_id`
 * даже у субдокумента в массиве (`_id: true` выше), но публичный контракт
 * `ScheduleRule` (shared) о нём не знает: `_id` — деталь хранения, нужная
 * планировщику занятий для ссылки `lessons.ruleId`. */
export interface LeanScheduleRule extends ScheduleRule {
  _id: Types.ObjectId;
}

@Schema({ timestamps: true, collection: 'classes' })
export class ClassRecord {
  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  groupLabel!: string;

  @Prop({ type: String, enum: CLASS_FORMATS, required: true })
  format!: ClassFormat;

  @Prop({ type: String, required: false })
  location?: string;

  @Prop({ type: String, required: false })
  zoomLink?: string;

  @Prop({ type: String, required: false })
  zoomPassword?: string;

  // См. USER_REFERENCE_PATHS.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  leaderId?: Types.ObjectId;

  @Prop({ type: [ScheduleRuleSchema], default: [] })
  rules!: ScheduleRule[];

  @Prop({ type: String, default: SCHOOL_TZ })
  tz!: string;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  channelIds!: Types.ObjectId[];

  @Prop({ type: Number, default: DEFAULT_LEAD_MINUTES })
  leadMinutes!: number;

  @Prop({ type: Boolean, default: true })
  active!: boolean;

  // Постоянный признак курса (ADR-0070, уточняет ADR-0059) — «начинающие»,
  // «медитация»: набирается один раз в расписании, не на каждой дате.
  // Отдельное поле от LessonRecord.tags (тег вечера) — форма даты своё не
  // показывает и не переписывает, иначе одно слово разъехалось бы на два
  // написания (ADR-0058). У занятий, заведённых до этого поля, документ его
  // не содержит — `.lean()` не подставляет default при чтении (class.mapper.ts,
  // тот же приём, что у LessonRecord.tags).
  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export const ClassSchema = SchemaFactory.createForClass(ClassRecord);
ClassSchema.index({ active: 1 });
// Фильтр по тегу курса (GET /api/classes?tag=…, ADR-0070) — тот же приём,
// что у LessonSchema.index({ tags: 1 }).
ClassSchema.index({ tags: 1 });

export const CLASS_FIELD_POLICY: FieldPolicy = {
  title: plain('публикуется в посте'),
  groupLabel: plain('публикуется в посте'),
  location: plain('адрес зала, публичный'),
  zoomLink: enc,
  zoomPassword: enc,
  'rules.time': plain('время слота, нужно для выборок'),
  tz: plain('IANA-зона для выборок'),
  tags: plain('рубрика курса, фильтр по тегу; не персональные данные'),
};

/** Схема шифрования класса — одна на все места чтения и записи (сервис,
 * планировщик рассылок, предпросмотр): читающий класс мимо неё получит
 * шифротекст вместо ссылки Zoom. */
export const CLASS_ENCRYPT_SCHEMA = encryptSchemaFrom(CLASS_FIELD_POLICY);
