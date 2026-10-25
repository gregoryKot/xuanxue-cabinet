// Подсхема объявления на доске ученика (ADR-0172) вынесена из settings.schema.ts
// ради лимита размера файла. Подсхема, не Mixed: пара полей постоянная. Пишется
// целиком (`$set: { boardNotice: {…} }`) и сбрасывается целиком (`$unset`),
// поэтому внутри обе строки обязательны — подобъекта с одним полем не бывает.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RULE_DATE_RE } from '@xuanxue/shared';

@Schema({ _id: false })
export class SettingsBoardNoticeSubdoc {
  @Prop({ type: String, required: true })
  text!: string;

  // 'YYYY-MM-DD' в поясе школы, последний день показа включительно.
  @Prop({ type: String, required: true, match: RULE_DATE_RE })
  until!: string;
}
export const SettingsBoardNoticeSchema = SchemaFactory.createForClass(
  SettingsBoardNoticeSubdoc,
);
