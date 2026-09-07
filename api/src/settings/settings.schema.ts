// Настройки школы (данные школы, ADR-0010) — один документ на всю систему
// (docs/PLAN.md §4). Фиксированный `_id: 'school'` вместо ObjectId: школа
// одна, второй документ этой коллекции появиться не должен и не может —
// SettingsService.get() всегда upsert по этому же id.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SCHOOL_TZ } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';

export const SETTINGS_SCHOOL_ID = 'school';

// Подсхема, не Mixed (CLAUDE.md — Mixed только с причиной, здесь причины
// нет: у объекта ровно два постоянных поля, а не произвольная форма).
@Schema({ _id: false })
class SettingsTemplatesSubdoc {
  @Prop({ type: String, required: true })
  lessonLink!: string;

  @Prop({ type: String, required: true })
  recording!: string;
}
const SettingsTemplatesSchema = SchemaFactory.createForClass(SettingsTemplatesSubdoc);

@Schema({ timestamps: true, collection: 'settings', _id: false })
export class SettingsRecord {
  @Prop({ type: String, required: true, default: SETTINGS_SCHOOL_ID })
  _id!: string;

  @Prop({ type: SettingsTemplatesSchema, required: true })
  templates!: SettingsTemplatesSubdoc;

  @Prop({ type: String, required: true, default: SCHOOL_TZ })
  tz!: string;
}

export const SettingsSchema = SchemaFactory.createForClass(SettingsRecord);

export const SETTINGS_FIELD_POLICY: FieldPolicy = {
  'templates.lessonLink': plain('текст поста пишет учитель, публикуется как есть'),
  'templates.recording': plain('текст поста пишет учитель, публикуется как есть'),
  tz: plain('часовой пояс школы, нужен для выборок'),
};
