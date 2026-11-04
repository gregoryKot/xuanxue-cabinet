// Группа учеников школы (ADR-0193) — данные школы, не ученика (ADR-0010):
// общий список, из которого занятие выбирает одну или несколько групп.
// Порядок списка — порядок создания (по `_id`): три первые группы заводит
// миграция в привычном школе порядке, новые встают следом.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { plain, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'groups' })
export class GroupRecord {
  @Prop({ type: String, required: true })
  name!: string;

  // Название без регистра и пробелов по краям: «Средние» и « средние » — одна
  // группа. Уникальный индекс держит это и при гонке двух «Добавить».
  @Prop({ type: String, required: true })
  nameKey!: string;
}

export const GroupSchema = SchemaFactory.createForClass(GroupRecord);
GroupSchema.index({ nameKey: 1 }, { unique: true });

export const GROUP_FIELD_POLICY: FieldPolicy = {
  name: plain('публикуется в посте первой строкой; не персональные данные'),
  nameKey: plain('ключ уникальности названия, нужен для поиска'),
};
