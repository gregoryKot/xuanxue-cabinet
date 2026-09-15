// GET /me/lessons — ближайшие занятия школы (ТЗ docs/PLAN.md §11). Без
// @Roles: доступно любой роли, включая ученика и гостя без единой роли —
// тот же приём, что у NotificationPrefsController (`/me/notifications`):
// человек смотрит расписание школы, а не свои данные, но маршрут всё равно
// требует сессии (AuthGuard), не публичный.
import { Controller, Get, Query } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MyLessonDto } from '@xuanxue/shared';
import { ListMyLessonsDto } from './dto/list-my-lessons.dto';
import { MyLessonsService } from './my-lessons.service';

@Controller('me/lessons')
export class MyLessonsController {
  constructor(private readonly myLessonsService: MyLessonsService) {}

  @Get()
  list(@Query() query: ListMyLessonsDto): Promise<MyLessonDto[]> {
    return this.myLessonsService.list(query, DateTime.utc());
  }
}
