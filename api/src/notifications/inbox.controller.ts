// GET/POST /me/inbox — лента уведомлений кабинета (слой in-app уведомлений,
// ADR-0061): InAppExamNotifier (третье плечо ExamNotifier) пишет сюда,
// колокольчик кабинета читает отсюда. Без @Roles — доступно любой роли,
// включая ученика: тот же приём, что у NotificationPrefsController
// (`/me/notifications`) и MyExamsController (`/me/exams`). Отдельный
// контроллер, не метод NotificationPrefsController — один маршрут, один
// контроллер (scripts/check-route-collisions.mjs): `/me/notifications` занят
// настройками, лента живёт на своём префиксе.
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
import type { InboxPageDto, NotificationDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ListInboxDto } from './dto/list-inbox.dto';
import { InboxService } from './inbox.service';

@Controller('me/inbox')
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  list(
    @Query() query: ListInboxDto,
    @CurrentUser() user: UserLean,
  ): Promise<InboxPageDto> {
    return this.inboxService.list(user.id, query);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<NotificationDto> {
    return this.inboxService.markRead(user.id, id, DateTime.utc());
  }

  // 204 — пометка целой ленты, не одной строки: клиенту нечего подставить в
  // экран точечно, только погасить бейдж (тот же приём, что у DELETE-действий
  // без тела, classes.controller.ts/materials.controller.ts).
  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() user: UserLean): Promise<void> {
    return this.inboxService.markAllRead(user.id, DateTime.utc());
  }
}
