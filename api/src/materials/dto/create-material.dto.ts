// Тело POST /materials (слой 3.1, docs/PLAN.md §14, ADR-0047). `createdBy` —
// из сессии (@CurrentUser), не из тела запроса.
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
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
  type CreateMaterialInput,
  type MaterialAccess,
  type MaterialKind,
} from '@xuanxue/shared';
import { TrimString } from '../../common/validation';

export class CreateMaterialDto implements CreateMaterialInput {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MATERIAL_LIMITS.title)
  title!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MATERIAL_LIMITS.url)
  url!: string;

  @IsIn(MATERIAL_KINDS)
  kind!: MaterialKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATERIAL_MAX_CLASS_IDS)
  @IsMongoId({ each: true })
  classIds?: string[];

  @IsOptional()
  @IsIn(MATERIAL_ACCESS_LEVELS)
  access?: MaterialAccess;

  // Рубрикация свободным текстом (ADR-0058) — нормализация (обрезка,
  // дедуп без учёта регистра) при записи, MaterialsService.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TAG_LIMITS.perRecord)
  @IsString({ each: true })
  @MaxLength(TAG_LIMITS.length, { each: true })
  tags?: string[];
}
