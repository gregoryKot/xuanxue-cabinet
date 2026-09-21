// Query GET /materials (слои 3.1 и 3.6). `classId`/`lessonId` — не
// `@IsMongoId()`: кривой id не ошибка формы, а фильтр без результатов
// (MaterialsService.list, materials.queries.ts), тот же принцип, что у
// поиска по несуществующему тегу — пустой список, а не 400/500.
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MATERIAL_KINDS,
  TAG_LIMITS,
  type ListMaterialsQuery,
  type MaterialKind,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListMaterialsDto implements ListMaterialsQuery {
  @IsOptional()
  @IsString()
  classId?: string;

  // ADR-0056: фильтр по дате занятия рядом с фильтром по курсу.
  @IsOptional()
  @IsString()
  lessonId?: string;

  @IsOptional()
  @IsIn(MATERIAL_KINDS)
  kind?: MaterialKind;

  // Точное совпадение тега (ADR-0058) — пустая строка ведёт себя как
  // «фильтр не задан», см. buildMaterialsFilter.
  @IsOptional()
  @IsString()
  @MaxLength(TAG_LIMITS.length)
  tag?: string;

  @ListLimit()
  limit?: number;
}
