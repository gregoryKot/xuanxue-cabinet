// GET/PATCH /me/notifications — настройка уведомлений себя (ТЗ
// notifications-api.md). Без @Roles: доступно любой роли, включая ученика и
// гостя без единой роли, — человек настраивает только свой аккаунт, userId
// и roles берутся из сессии (@CurrentUser), не из тела или query.
import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { NotificationPrefsDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { UpdateNotificationPrefsDto } from './dto/update-notification-prefs.dto';
import { NotificationPrefsService } from './notification-prefs.service';

@Controller('me/notifications')
export class NotificationPrefsController {
  constructor(private readonly notificationPrefsService: NotificationPrefsService) {}

  @Get()
  get(@CurrentUser() user: UserLean): Promise<NotificationPrefsDto> {
    return this.notificationPrefsService.get(user.id, user.roles);
  }

  // Возвращает полный NotificationPrefsDto, не только принятый переключатель
  // (тот же приём, что SettingsController.update): бот и кабинет обновляют
  // экран настроек одним ответом, без отдельного GET следом.
  @Patch()
  async update(
    @Body() body: UpdateNotificationPrefsDto,
    @CurrentUser() user: UserLean,
  ): Promise<NotificationPrefsDto> {
    await this.notificationPrefsService.set(user.id, body.kind, body.enabled);
    return this.notificationPrefsService.get(user.id, user.roles);
  }
}
