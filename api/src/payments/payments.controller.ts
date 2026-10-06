// /payments — бухгалтер и админ (ADR-0049): деньги ученика не входят в
// «данные школы» наравне с расписанием и каналами (ADR-0010), поэтому
// доступ не `teacher`/`assistant` (SECURITY §3), а отдельная роль
// `accountant`. Контроллер только валидирует тело/query и зовёт сервис.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { ResponseLike } from '../common/http-headers';
import type { UserLean } from '../users/users.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { PaymentScreenshotsService } from './payment-screenshots.service';
import { PaymentsService } from './payments.service';

// Снимок заменяется новым по тому же адресу и удаляется уборщиком
// (ADR-0050), а на нём реквизиты — ни браузер, ни прокси его не хранят.
// Ставится в теле хендлера после удачного чтения, не декоратором: заголовок
// декоратора уезжает и вместе с 404 (тот же приём, что у exam-images).
const SCREENSHOT_CACHE_CONTROL = 'private, no-store';

@Controller('payments')
@Roles('accountant', 'admin')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly screenshotsService: PaymentScreenshotsService,
  ) {}

  @Get()
  @ApiRoute('GET /payments')
  list(@Query() query: ListPaymentsDto): Promise<PaymentsPageDto> {
    return this.paymentsService.listMonth(query, DateTime.utc());
  }

  // Снимок из кабинета (ADR-0149); снимок бота здесь 404 с текстом «лежит в
  // Telegram» — байтов у нас нет (ADR-0050).
  @Get(':userId/:month/screenshot')
  async screenshot(
    @Param('userId') userId: string,
    @Param('month') month: string,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<StreamableFile> {
    const image = await this.screenshotsService.load(userId, month);
    res.setHeader('Cache-Control', SCREENSHOT_CACHE_CONTROL);
    return new StreamableFile(image.bytes, {
      type: image.contentType,
      length: image.bytes.length,
    });
  }

  @Post(':userId/:month/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiRoute('POST /payments/:userId/:month/confirm')
  confirm(
    @Param('userId') userId: string,
    @Param('month') month: string,
    @Body() body: ConfirmPaymentDto,
    @CurrentUser() user: UserLean,
  ): Promise<PaymentDto> {
    return this.paymentsService.confirm(userId, month, body, user.id, DateTime.utc());
  }

  @Post(':userId/:month/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiRoute('POST /payments/:userId/:month/revoke')
  revoke(
    @Param('userId') userId: string,
    @Param('month') month: string,
  ): Promise<PaymentDto> {
    return this.paymentsService.revoke(userId, month);
  }
}
