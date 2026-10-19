// GET /me/notifications/lessons/sync — снимок настроек напоминаний (ADR-0185).
// Единственный маршрут настроек, куда AuthGuard пускает и cookie браузера, и
// bearer приложения Daychi (@AllowNativeBearer). Без @Roles — как весь
// `/me/notifications/lessons`; аккаунт — только из @CurrentUser, не из запроса
// (SECURITY §3). `Cache-Control: no-store` ставит middleware в
// NotificationsModule: отказы 401/403/429 пишет фильтр, не доходя сюда.
import { Controller, Get } from '@nestjs/common';
import type { ReminderSyncSnapshot } from '@xuanxue/shared';
import { AllowNativeBearer, CurrentUser } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { ReminderSyncService } from './reminder-sync.service';

@Controller('me/notifications/lessons/sync')
export class ReminderSyncController {
  constructor(private readonly reminderSync: ReminderSyncService) {}

  @AllowNativeBearer()
  @Get()
  @ApiRoute('GET /me/notifications/lessons/sync')
  get(@CurrentUser() user: UserLean): Promise<ReminderSyncSnapshot> {
    return this.reminderSync.getSnapshot(user.id);
  }
}
