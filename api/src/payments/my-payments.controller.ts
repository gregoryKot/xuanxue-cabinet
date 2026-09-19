// GET /me/payments — свои месяцы (ADR-0049): владение по сессии, не по
// роли и не по параметру пути (SECURITY §3), доступно любой роли, включая
// ученика и гостя без единой роли. Образец — notification-prefs.controller.ts.
import { Controller, Get } from '@nestjs/common';
import type { MyPaymentDto } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { PaymentsService } from './payments.service';

@Controller('me/payments')
export class MyPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  list(@CurrentUser() user: UserLean): Promise<MyPaymentDto[]> {
    return this.paymentsService.listMine(user.id);
  }
}
