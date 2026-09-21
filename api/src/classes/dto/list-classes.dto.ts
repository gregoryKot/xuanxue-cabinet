// Query GET /classes. Лимит по умолчанию LIST_LIMIT_DEFAULT, максимум
// LIST_LIMIT_MAX — «дай всё» запрещён (CLAUDE.md, раздел «API»).
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { TAG_LIMITS, type ListClassesQuery } from '@xuanxue/shared';
import { booleanFromQuery } from '../../common/query-transforms';
import { ListLimit } from '../../common/validation';

export class ListClassesDto implements ListClassesQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => booleanFromQuery(value))
  @IsBoolean()
  active?: boolean;

  // Точное совпадение тега курса (ADR-0072) — тот же приём, что у
  // ListLessonsDto.tag: пустая строка ведёт себя как «фильтр не задан».
  @IsOptional()
  @IsString()
  @MaxLength(TAG_LIMITS.length)
  tag?: string;

  @ListLimit()
  limit?: number;
}
