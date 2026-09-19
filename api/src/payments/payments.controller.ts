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
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@Roles('accountant', 'admin')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(@Query() query: ListPaymentsDto): Promise<PaymentsPageDto> {
    return this.paymentsService.listMonth(query, DateTime.utc());
  }

  @Post(':userId/:month/confirm')
  @HttpCode(HttpStatus.OK)
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
  revoke(
    @Param('userId') userId: string,
    @Param('month') month: string,
  ): Promise<PaymentDto> {
    return this.paymentsService.revoke(userId, month);
  }
}
