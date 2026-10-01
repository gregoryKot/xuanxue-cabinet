// GET /notifications/lesson-prefs-stats — число для штата школы: сколько
// учеников выбрали свои занятия и своё время напоминания (ADR-0162, п. 5).
// Только штат: `@Roles` на классе, как у остальных контроллеров школы. Ответ —
// три числа без имён и без чужих настроек (SECURITY §3).
import { Controller, Get } from '@nestjs/common';
import type { LessonPrefsStatsDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { LessonPrefsStatsService } from './lesson-prefs-stats.service';

@Controller('notifications')
@Roles('teacher', 'assistant', 'admin')
export class LessonPrefsStatsController {
  constructor(private readonly stats: LessonPrefsStatsService) {}

  @Get('lesson-prefs-stats')
  @ApiRoute('GET /notifications/lesson-prefs-stats')
  get(): Promise<LessonPrefsStatsDto> {
    return this.stats.getStats();
  }
}
