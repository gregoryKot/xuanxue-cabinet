// GET /me/payments — свои месяцы (ADR-0049): владение по сессии, не по
// роли и не по параметру пути (SECURITY §3), доступно любой роли, включая
// ученика и гостя без единой роли. Образец — notification-prefs.controller.ts.
//
// POST /me/payments/:month/screenshot — снимок перевода сырым телом
// (ADR-0050, слой 2.2): запасной путь тому, чей Telegram с кабинетом не
// связан. Владение — та же сессия, месяц в пути говорит только «за какой».
import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MyPaymentDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentsService } from './payments.service';

/** Минимальный интерфейс вместо @types/express (которого нет в зависимостях
 * api/) — тот же приём, что RawBodyRequest в exam-images.controller.ts.
 * `@Body()` здесь не годится: ValidationPipe (transform: true) попытался бы
 * превратить сырой Buffer в экземпляр класса DTO. */
interface RawBodyRequest {
  body?: unknown;
}

@Controller('me/payments')
export class MyPaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly screenshotsService: PaymentScreenshotsService,
  ) {}

  @Get()
  list(@CurrentUser() user: UserLean): Promise<MyPaymentDto[]> {
    return this.paymentsService.listMine(user.id);
  }

  @Post(':month/screenshot')
  @HttpCode(HttpStatus.CREATED)
  uploadScreenshot(
    @Param('month') month: string,
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<MyPaymentDto> {
    return this.screenshotsService.upload(req.body, user.id, month, DateTime.utc());
  }
}
