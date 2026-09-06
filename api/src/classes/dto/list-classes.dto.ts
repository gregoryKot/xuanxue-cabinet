// Query GET /classes. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import type { ListClassesQuery } from '@xuanxue/shared';
import { booleanFromQuery } from '../../common/query-transforms';
import { ListLimit } from '../../common/validation';

export class ListClassesDto implements ListClassesQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => booleanFromQuery(value))
  @IsBoolean()
  active?: boolean;

  @ListLimit()
  limit?: number;
}
