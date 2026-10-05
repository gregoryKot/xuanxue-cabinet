// GET /public/lessons — первый публичный маршрут с данными школы (ADR-0170).
// Открыт без сессии, потому что так велит контракт Workshop (daychi читает
// расписание без входа) и решение владельца 2026-10-04: расписание без Zoom
// публично, с Zoom — только по сессии (`/me/lessons`). Сессия ответ не
// расширяет: проекция одна, явный маппер-allowlist без Zoom.
//
// Троттлинг — общий глобальный, бакет по IP (неверифицированная идентичность,
// CLAUDE.md правило 4, ADR-0164). `@SkipThrottle` не ставим: открытый маршрут
// без лимита — дармовая нагрузка на базу.
import { Controller, Get, Query } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PublicLessonDto } from '@xuanxue/shared';
import { Public } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { ListPublicLessonsDto } from './dto/list-public-lessons.dto';
import { PublicLessonsService } from './public-lessons.service';

@Controller('public/lessons')
export class PublicLessonsController {
  constructor(private readonly publicLessonsService: PublicLessonsService) {}

  @Get()
  @Public()
  @ApiRoute('GET /public/lessons')
  list(@Query() query: ListPublicLessonsDto): Promise<PublicLessonDto[]> {
    return this.publicLessonsService.list(query, DateTime.utc());
  }
}
