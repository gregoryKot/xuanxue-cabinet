// GET /me/lessons — ближайшие занятия школы (ТЗ docs/PLAN.md §11). Без
// @Roles: доступно любой роли, включая ученика и гостя без единой роли —
// тот же приём, что у NotificationPrefsController (`/me/notifications`):
// человек смотрит расписание школы, а не свои данные, но маршрут всё равно
// требует сессии (AuthGuard), не публичный.
//
// GET /me/lessons/archive — тот же ресурс назад по времени (ТЗ docs/PLAN.md
// §14 слой 3.3): статический сегмент `archive` не конфликтует с остальными
// маршрутами контроллера (check-route-collisions.mjs), отдельный контроллер
// не заводится.
import { Controller, Get, Query } from '@nestjs/common';
import { DateTime } from 'luxon';
import { isStaffRole, type MyArchivedLessonDto, type MyLessonDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ListMyArchivedLessonsDto } from './dto/list-my-archived-lessons.dto';
import { ListMyLessonsDto } from './dto/list-my-lessons.dto';
import { MyLessonsArchiveService } from './my-lessons-archive.service';
import { MyLessonsService } from './my-lessons.service';

@Controller('me/lessons')
export class MyLessonsController {
  constructor(
    private readonly myLessonsService: MyLessonsService,
    private readonly myLessonsArchiveService: MyLessonsArchiveService,
  ) {}

  @Get()
  list(@Query() query: ListMyLessonsDto): Promise<MyLessonDto[]> {
    return this.myLessonsService.list(query, DateTime.utc());
  }

  @Get('archive')
  listArchive(
    @Query() query: ListMyArchivedLessonsDto,
    @CurrentUser() user: UserLean,
  ): Promise<MyArchivedLessonDto[]> {
    // Штат видит материалы архива как обычно, без рубильника — тот же приём,
    // что MyMaterialsController (ADR-0048).
    return this.myLessonsArchiveService.list(
      query,
      DateTime.utc(),
      isStaffRole(user.roles),
    );
  }
}
