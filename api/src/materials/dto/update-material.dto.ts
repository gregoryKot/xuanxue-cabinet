// Тело PATCH /materials/:id (слой 3.1). Большинству полей `null` не имеет
// смысла (сбрасывать название или вид частично незачем) — у них
// `OptionalNotNull()`, тот же приём, что у UpdateGradingCommentPresetDto.
// `url` — единственное исключение (ADR-0134): `null` значит «убрать
// ссылку», материал остаётся с файлом. У него обычный `@IsOptional()` —
// он пропускает и `undefined`, и `null`, декораторы ниже (`@IsUrl` и
// `@MaxLength`) на `null` уже не запускаются, `splitUpdate`
// (api/src/common/patch-update.ts, `NULLABLE_MATERIAL_FIELDS`) превращает
// `null` в `$unset` — тот же приём, что у nullable-полей занятия
// (update-lesson.dto.ts).
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
  MATERIAL_MAX_LESSON_IDS,
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

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MATERIAL_LIMITS.url)
  url?: string | null;

  @OptionalNotNull()
  @IsIn(MATERIAL_KINDS)
  kind?: MaterialKind;

  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MATERIAL_MAX_CLASS_IDS)
  @IsMongoId({ each: true })
  classIds?: string[];

  // ADR-0056: привязка к дате занятия рядом с привязкой к курсу.
  @OptionalNotNull()
  @IsArray()
  @ArrayMaxSize(MATERIAL_MAX_LESSON_IDS)
  @IsMongoId({ each: true })
  lessonIds?: string[];

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
