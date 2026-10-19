// GET и PATCH /me/notifications/lessons/sync — снимок настроек напоминаний и его
// изменение (ADR-0185). Единственный маршрут настроек, куда AuthGuard пускает и
// cookie браузера, и bearer приложения Daychi (@AllowNativeBearer). Без @Roles —
// как весь `/me/notifications/lessons`; аккаунт — только из @CurrentUser, не из
// запроса (SECURITY §3). `Cache-Control: no-store` ставит middleware в
// NotificationsModule: отказы 401/403/429 пишет фильтр, не доходя сюда.
//
// У PATCH нет DTO и `@Body()`: тело — сырой текст, его читает
// reminder-sync-body.ts (причина — там и в reminder-sync-patch.ts).
import { Controller, Get, Patch, Req } from '@nestjs/common';
import type { ReminderSyncSnapshot } from '@xuanxue/shared';
import { AllowNativeBearer, CurrentUser } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { readReminderPatch, type ReminderPatchRequestLike } from './reminder-sync-body';
import { ReminderSyncWriteService } from './reminder-sync-write.service';
import { ReminderSyncService } from './reminder-sync.service';

@Controller('me/notifications/lessons/sync')
export class ReminderSyncController {
  constructor(
    private readonly reminderSync: ReminderSyncService,
    private readonly reminderSyncWrite: ReminderSyncWriteService,
  ) {}

  @AllowNativeBearer()
  @Get()
  @ApiRoute('GET /me/notifications/lessons/sync')
  get(@CurrentUser() user: UserLean): Promise<ReminderSyncSnapshot> {
    return this.reminderSync.getSnapshot(user.id);
  }

  @AllowNativeBearer()
  @Patch()
  @ApiRoute('PATCH /me/notifications/lessons/sync')
  patch(
    @CurrentUser() user: UserLean,
    @Req() request: ReminderPatchRequestLike,
  ): Promise<ReminderSyncSnapshot> {
    return this.reminderSyncWrite.patch(user.id, readReminderPatch(request));
  }
}
