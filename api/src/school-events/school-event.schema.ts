// Событие школы: ретрит, семинар, выезд (ADR-0177) — данные школы (ADR-0010),
// не ученика: список общий для всего штата и виден любому вошедшему.
// `title`/`place`/`description` — свободный текст учителя, шифруются как
// обычные поля верхнего уровня (enc, SECURITY §5). Персональных данных
// учеников в событии нет. `createdBy` — ссылка на автора (USER_REFERENCE_PATHS,
// user-data.registry.ts), не признак владения: удаление аккаунта учителя не
// должно унести событие школы.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { enc, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'school_events' })
export class SchoolEventRecord {
  @Prop({ type: String, required: true })
  title!: string;

  // Момент в UTC; учитель вводит дату и час по своим часам (ADR-0177).
  @Prop({ type: Date, required: true })
  startsAt!: Date;

  // Только у многодневного события; без него событие кончается в `startsAt`.
  @Prop({ type: Date, required: false })
  endsAt?: Date;

  @Prop({ type: String, required: false })
  place?: string;

  @Prop({ type: String, required: false })
  description?: string;

  // Не required: удаление аккаунта учителя делает $unset этого поля
  // (USER_REFERENCE_PATHS), событие школы остаётся (инцидент 2026-10-02).
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;
}

export const SchoolEventSchema = SchemaFactory.createForClass(SchoolEventRecord);
// Оба списка (штат — по убыванию, ученик — от ближайшего) идут по началу.
SchoolEventSchema.index({ startsAt: 1 });

export const SCHOOL_EVENT_FIELD_POLICY: FieldPolicy = {
  title: enc,
  place: enc,
  description: enc,
};

/** Схема шифрования события — одна на все места чтения и записи
 * (SchoolEventsService). */
export const SCHOOL_EVENT_ENCRYPT_SCHEMA = encryptSchemaFrom(SCHOOL_EVENT_FIELD_POLICY);
