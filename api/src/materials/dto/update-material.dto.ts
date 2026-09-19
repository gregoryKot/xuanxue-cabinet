// Тело PATCH /materials/:id (слой 3.1). `null` не имеет смысла ни у одного
// поля (сбрасывать название или ссылку частично незачем) — поэтому
// `OptionalNotNull()`, а не обычный `@IsOptional()`, тот же приём, что у
// UpdateGradingCommentPresetDto.
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import {
  MATERIAL_ACCESS_LEVELS,
  MATERIAL_KINDS,
  MATERIAL_LIMITS,
  MATERIAL_MAX_CLASS_IDS,
  TAG_LIMITS,
  type MaterialAccess,
  type MaterialKind,
  type UpdateMaterialInput,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class UpdateMaterialDto implements UpdateMaterialInput {
  @OptionalNotNull()
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MATERIAL_LIMITS.title)
  title?: string;

  @OptionalNotNull()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MATERIAL_LIMITS.url)
  url?: string;

  @OptionalNotNull()
  @IsIn(MATERIAL_KINDS)
  kind?: MaterialKind;

  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MATERIAL_MAX_CLASS_IDS)
  @IsMongoId({ each: true })
  classIds?: string[];

  @OptionalNotNull()
  @IsIn(MATERIAL_ACCESS_LEVELS)
  access?: MaterialAccess;

  // Рубрикация свободным текстом (ADR-0058) — нормализация (обрезка,
  // дедуп без учёта регистра) при записи, MaterialsService, только если
  // поле прислали.
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(TAG_LIMITS.perRecord)
  @IsString({ each: true })
  @MaxLength(TAG_LIMITS.length, { each: true })
  tags?: string[];
}
