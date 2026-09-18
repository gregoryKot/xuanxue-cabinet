// Query GET /materials (слой 3.1). `classId` — не `@IsMongoId()`: кривой id
// не ошибка формы, а фильтр без результатов (MaterialsService.list), тот же
// принцип, что у поиска по несуществующему тегу — пустой список, а не 400/500.
import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  MATERIAL_KINDS,
  type ListMaterialsQuery,
  type MaterialKind,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListMaterialsDto implements ListMaterialsQuery {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsIn(MATERIAL_KINDS)
  kind?: MaterialKind;

  @ListLimit()
  limit?: number;
}
