// Query GET /lessons. Окно `from..to` обязательно (список дат занятий без
// периода — «дай всё», запрещено CLAUDE.md «API») и не шире горизонта
// планировщика — проверка окна в lesson-dates.ts (assertListWindow), не
// здесь: class-validator видит только формат ISO, не сам горизонт.
import { IsISO8601, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { TAG_LIMITS, type ListLessonsQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListLessonsDto implements ListLessonsQuery {
  @IsISO8601({ strict: true })
  from!: string;

  @IsISO8601({ strict: true })
  to!: string;

  @IsOptional()
  @IsMongoId()
  classId?: string;

  // Точное совпадение тега (ADR-0070) — пустая строка ведёт себя как
  // «фильтр не задан», тот же приём, что у ListMaterialsDto.tag.
  @IsOptional()
  @IsString()
  @MaxLength(TAG_LIMITS.length)
  tag?: string;

  @ListLimit()
  limit?: number;
}
