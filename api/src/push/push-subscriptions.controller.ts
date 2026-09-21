// POST/DELETE /me/push-subscriptions — подписка браузера на push (ADR-0092,
// «Порядок работ» PR №3). Без @Roles: доступно любой роли, включая ученика
// без единой роли (ADR-0026) — push обещан всем ролям, не только штату
// (ADR-0092), маршрут всё равно требует сессии (AuthGuard).
import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { PushSubscriptionDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';
import { PushSubscriptionsService } from './push-subscriptions.service';

@Controller('me/push-subscriptions')
export class PushSubscriptionsController {
  constructor(private readonly pushSubscriptionsService: PushSubscriptionsService) {}

  @Post()
  subscribe(
    @Body() body: SubscribePushDto,
    @CurrentUser() user: UserLean,
  ): Promise<PushSubscriptionDto> {
    return this.pushSubscriptionsService.subscribe(user.id, body);
  }

  // 204: клиент уже знает endpoint, который отписывал, — тем же приёмом, что
  // MyNoTelegramController.update (204, не обновлённый DTO).
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Body() body: UnsubscribePushDto,
    @CurrentUser() user: UserLean,
  ): Promise<void> {
    await this.pushSubscriptionsService.unsubscribe(user.id, body.endpoint);
  }
}
