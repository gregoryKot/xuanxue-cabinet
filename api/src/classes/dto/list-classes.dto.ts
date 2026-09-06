// Query GET /classes. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { LIST_LIMIT_MAX, type ListClassesQuery } from '@xuanxue/shared';
import { booleanFromQuery } from '../../common/query-transforms';

const MIN_LIMIT = 1;

export class ListClassesDto implements ListClassesQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => booleanFromQuery(value))
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LIMIT)
  @Max(LIST_LIMIT_MAX)
  limit?: number;
}
