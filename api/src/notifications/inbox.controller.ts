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
import type { InboxPageDto } from '@xuanxue/shared';
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

  // Отдаёт страницу ленты целиком (InboxPageDto), не одну отмеченную строку
  // (NotificationDto) — экран держит ленту вместе с агрегатом unreadCount,
  // и подставить в него одну строку было бы недостаточно: досчитывать
  // unreadCount на клиенте значило бы завести там вторую копию правила
  // подсчёта, чего ADR-0087 прямо не советует. Тот же список, что у GET —
  // с лимитом по умолчанию (ListInboxQuery без параметров), не «дай всё».
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<InboxPageDto> {
    await this.inboxService.markRead(user.id, id, DateTime.utc());
    return this.inboxService.list(user.id, {});
  }

  // Было 204 — пометка целой ленты, клиенту нечего было подставить в экран
  // точечно, только погасить бейдж. Теперь бейдж и есть unreadCount из
  // InboxPageDto: отдаём страницу целиком тем же приёмом, что markRead()
  // выше — вместо 204 и отдельного GET следом (ADR-0087, «Последствия»).
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: UserLean): Promise<InboxPageDto> {
    await this.inboxService.markAllRead(user.id, DateTime.utc());
    return this.inboxService.list(user.id, {});
  }
}
