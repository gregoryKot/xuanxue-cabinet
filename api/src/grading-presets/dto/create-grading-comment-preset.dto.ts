// Тело POST /grading-presets (слой 4.6, ADR-0041) — текст заготовки и
// необязательный заголовок. `createdBy` — из сессии (@CurrentUser), не из
// тела запроса.
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { GRADING_COMMENT_PRESET_LIMITS, type ApiRouteBody } from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class CreateGradingCommentPresetDto implements ApiRouteBody<'POST /grading-presets'> {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(GRADING_COMMENT_PRESET_LIMITS.text)
  text!: string;

  @IsOptional()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(GRADING_COMMENT_PRESET_LIMITS.title)
  title?: string;
}
