// Тело PATCH /grading-presets/:id (слой 4.6, ADR-0041). `null` не имеет
// смысла ни у одного поля (текст заготовки не «сбрасывают» частично) —
// поэтому `OptionalNotNull()`, а не обычный `@IsOptional()`, тот же приём,
// что у channels (UpdateChannelDto).
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  GRADING_COMMENT_PRESET_LIMITS,
  type UpdateGradingCommentPresetInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateGradingCommentPresetDto implements UpdateGradingCommentPresetInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(GRADING_COMMENT_PRESET_LIMITS.text)
  text?: string;

  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(GRADING_COMMENT_PRESET_LIMITS.title)
  title?: string;
}
