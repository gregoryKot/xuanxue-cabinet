// Query GET /lessons. Окно `from..to` обязательно, если не задан тег
// (список дат занятий без периода и без тега — «дай всё», запрещено
// CLAUDE.md «API») — оба поля здесь просто @IsOptional(), сама
// обязательность (окно целиком или тег) и предел горизонта планировщика —
// одно место, `resolveLessonsWindow` (lesson-dates.ts, ADR-0074):
// class-validator видит только формат ISO у каждого поля порознь, не
// зависимость между ними.
import { IsISO8601, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { TAG_LIMITS, type ListLessonsQuery } from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListLessonsDto implements ListLessonsQuery {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsMongoId()
  classId?: string;

  // Точное совпадение тега (ADR-0059) — пустая строка ведёт себя как
  // «фильтр не задан», тот же приём, что у ListMaterialsDto.tag.
  @IsOptional()
  @IsString()
  @MaxLength(TAG_LIMITS.length)
  tag?: string;

  @ListLimit()
  limit?: number;
}
