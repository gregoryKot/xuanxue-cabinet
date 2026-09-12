// GET /me/exams — опубликованные формы и положение ученика по ним (ТЗ
// student-api.md). Без @Roles: доступно любой роли, включая гостя без
// единой роли — тот же приём, что у NotificationPrefsController
// (`/me/notifications`) и MyLessonsController (`/me/lessons`); `userId` —
// только из сессии, не из query.
import { Controller, Get, Query } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MyExamDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ListMyExamsDto } from './dto/list-my-exams.dto';
import { MyExamsService } from './my-exams.service';

@Controller('me/exams')
export class MyExamsController {
  constructor(private readonly myExamsService: MyExamsService) {}

  @Get()
  list(
    @Query() query: ListMyExamsDto,
    @CurrentUser() user: UserLean,
  ): Promise<MyExamDto[]> {
    return this.myExamsService.list(query, user.id, DateTime.utc());
  }
}
