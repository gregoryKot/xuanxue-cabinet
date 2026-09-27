// GET /me/exams — опубликованные формы и положение ученика по ним (ТЗ
// docs/PLAN.md §11). Без @Roles: доступно любой роли, включая гостя без
// единой роли — тот же приём, что у NotificationPrefsController
// (`/me/notifications`) и MyLessonsController (`/me/lessons`); `userId` —
// только из сессии, не из query.
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
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

  // Отдаёт список целиком (MyExamDto[]), не 204 — тот же приём, что у
  // InboxController.markRead/dismiss (ADR-0087): клиенту не нужен второй
  // GET /me/exams следом за POST. Кабинет сам флаг ставит сразу и ответ на
  // экран не кладёт — почему, в MyExamsProvider.tsx (гонка со стартом).
  @Post(':examId/seen')
  @HttpCode(HttpStatus.OK)
  async markSeen(
    @Param('examId') examId: string,
    @CurrentUser() user: UserLean,
  ): Promise<MyExamDto[]> {
    await this.myExamsService.markSeen(examId, user.id);
    return this.myExamsService.list({}, user.id, DateTime.utc());
  }
}
