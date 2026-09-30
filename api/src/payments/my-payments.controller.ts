// GET /me/payments — свои месяцы (ADR-0049): владение по сессии, не по
// роли и не по параметру пути (SECURITY §3), доступно любой роли, включая
// ученика и гостя без единой роли. Образец — notification-prefs.controller.ts.
// Вместе со строками отдаёт `month` — текущий месяц в поясе школы: его считает
// сервер, потому что кабинет пояса школы не знает, а 1-го числа в Сиднее уже
// октябрь, пока в Израиле сентябрь (ADR-0049).
//
// PUT /me/payments/reminder-day — свой день напоминания об оплате (ADR-0161).
//
// POST /me/payments/:month/screenshot — снимок перевода сырым телом
// (ADR-0050, слой 2.2): запасной путь тому, чей Telegram с кабинетом не
// связан. Владение — та же сессия, месяц в пути говорит только «за какой».
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type {
  MyPaymentDto,
  MyPaymentReminderDto,
  MyPaymentsPageDto,
} from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { SetPaymentReminderDayDto } from './dto/set-payment-reminder-day.dto';
import { PaymentReminderDayService } from './payment-reminder-day.service';
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
    private readonly reminderDays: PaymentReminderDayService,
  ) {}

  @Get()
  @ApiRoute('GET /me/payments')
  list(@CurrentUser() user: UserLean): Promise<MyPaymentsPageDto> {
    return this.paymentsService.listMine(user.id, DateTime.utc());
  }

  // Свой день напоминания (ADR-0161): владелец — сессия, ответ — то, что
  // теперь видит ученик в `GET /me/payments`, без второго запроса (ADR-0087).
  @Put('reminder-day')
  @ApiRoute('PUT /me/payments/reminder-day')
  setReminderDay(
    @Body() body: SetPaymentReminderDayDto,
    @CurrentUser() user: UserLean,
  ): Promise<MyPaymentReminderDto> {
    return this.reminderDays.set(user.id, body.dayOfMonth);
  }

  @Post(':month/screenshot')
  @HttpCode(HttpStatus.CREATED)
  @ApiRoute('POST /me/payments/:month/screenshot')
  uploadScreenshot(
    @Param('month') month: string,
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<MyPaymentDto> {
    return this.screenshotsService.upload(req.body, user, month, DateTime.utc());
  }
}
