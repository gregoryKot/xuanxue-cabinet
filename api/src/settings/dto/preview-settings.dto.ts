// Тело POST /settings/preview (docs/PLAN.md §6 «Шаблоны»).
import { IsIn, IsMongoId } from 'class-validator';
import {
  TEMPLATE_KINDS,
  type PreviewTemplateInput,
  type TemplateKind,
} from '@xuanxue/shared';

export class PreviewSettingsDto implements PreviewTemplateInput {
  @IsIn(TEMPLATE_KINDS)
  kind!: TemplateKind;

  @IsMongoId()
  lessonId!: string;
}
