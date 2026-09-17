// Заготовка частого комментария при проверке (слой 4.6, PLAN §11,
// ADR-0041) — данные школы (ADR-0010), не ученика: список общий для всего
// штата, как шаблоны рассылок. `text`/`title` — свободный текст автора,
// шифруются как обычные поля верхнего уровня (enc, SECURITY §5);
// `createdBy` — ссылка на автора (USER_REFERENCE_PATHS,
// user-data.registry.ts), не признак владения: удаление аккаунта автора не
// должно унести общую заготовку школы.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { enc, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'grading_comment_presets' })
export class GradingCommentPresetRecord {
  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: String, required: false })
  title?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: true })
  createdBy!: Types.ObjectId;
}

export const GradingCommentPresetSchema = SchemaFactory.createForClass(
  GradingCommentPresetRecord,
);
// Порядок списка учителю — по времени создания (ADR-0041): заготовки
// накапливаются, старые остаются на своих местах.
GradingCommentPresetSchema.index({ createdAt: 1 });

export const GRADING_COMMENT_PRESET_FIELD_POLICY: FieldPolicy = {
  text: enc,
  title: enc,
};

/** Схема шифрования заготовки — одна на все места чтения и записи
 * (GradingPresetsService). */
export const GRADING_COMMENT_PRESET_ENCRYPT_SCHEMA = encryptSchemaFrom(
  GRADING_COMMENT_PRESET_FIELD_POLICY,
);
