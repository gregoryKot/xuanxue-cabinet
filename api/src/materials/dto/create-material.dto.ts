// Тело POST /materials (слой 3.1, docs/PLAN.md §14, ADR-0047). `createdBy` —
// из сессии (@CurrentUser), не из тела запроса.
//
// `url` необязателен (ADR-0134, уточняет ADR-0057 и ADR-0047): материал
// существует и с одним файлом, ссылку заводят отдельным слоем (3.10).
// `@OptionalNotNull()`, не `@IsOptional()`: `null` для этого поля — не «поля
// нет», а ошибка формы (в create-запросе взять ссылку неоткуда, кроме тела
// запроса, значит `null` — не то, что мог прислать нормальный клиент), и
// `@IsUrl` ниже должен её поймать, а не молча пропустить, как `@IsOptional()`
// пропустил бы и `undefined`, и `null`. Пустая строка тоже не проходит —
// «нет ссылки» в этом контракте значит «поля `url` нет вовсе», а не «есть
// пустая строка» (CreateMaterialInput, shared/src/materials.ts).
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
  type ApiRouteBody,
  type MaterialAccess,
  type MaterialKind,
} from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class CreateMaterialDto implements ApiRouteBody<'POST /materials'> {
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MATERIAL_LIMITS.title)
  title!: string;

  @OptionalNotNull()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MATERIAL_LIMITS.url)
  url?: string;

  @IsIn(MATERIAL_KINDS)
  kind!: MaterialKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATERIAL_MAX_CLASS_IDS)
  @IsMongoId({ each: true })
  classIds?: string[];

  // ADR-0056: привязка к дате занятия рядом с привязкой к курсу.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATERIAL_MAX_LESSON_IDS)
  @IsMongoId({ each: true })
  lessonIds?: string[];

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
