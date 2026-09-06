// Query GET /lessons. Окно `from..to` обязательно (список дат занятий без
// периода — «дай всё», запрещено CLAUDE.md «API») и не шире горизонта
// планировщика — проверка окна в lesson-dates.ts (assertListWindow), не
// здесь: class-validator видит только формат ISO, не сам горизонт.
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { LIST_LIMIT_MAX, type ListLessonsQuery } from '@xuanxue/shared';

const MIN_LIMIT = 1;

export class ListLessonsDto implements ListLessonsQuery {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional()
  @IsMongoId()
  classId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_LIMIT)
  @Max(LIST_LIMIT_MAX)
  limit?: number;
}
