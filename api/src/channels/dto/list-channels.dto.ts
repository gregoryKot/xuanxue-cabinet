// Query GET /channels. Тот же декоратор лимита, что у /classes и /lessons
// (CLAUDE.md «одна механика — один компонент»); «дай всё» запрещён.
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import type { ListChannelsQuery } from '@xuanxue/shared';
import { booleanFromQuery } from '../../common/query-transforms';
import { ListLimit } from '../../common/validation';

export class ListChannelsDto implements ListChannelsQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => booleanFromQuery(value))
  @IsBoolean()
  active?: boolean;

  @ListLimit()
  limit?: number;
}
