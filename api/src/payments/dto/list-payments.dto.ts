// Query GET /payments — месяц опционален (сервис подставляет текущий в
// поясе школы), лимит — своя пара PAYMENT_LIMITS, не LIST_LIMIT_DEFAULT/MAX
// (docs/PLAN.md §15).
import { IsIn, IsOptional, Matches } from 'class-validator';
import {
  MONTH_KEY_RE,
  PAYMENT_LIMITS,
  PAYMENT_STATUSES,
  type ListPaymentsQuery,
  type PaymentStatus,
} from '@xuanxue/shared';
import { ListLimit } from '../../common/validation';

export class ListPaymentsDto implements ListPaymentsQuery {
  @IsOptional()
  @Matches(MONTH_KEY_RE, { message: 'в формате ГГГГ-ММ, например 2026-09.' })
  month?: string;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: PaymentStatus;

  @ListLimit(PAYMENT_LIMITS.listLimitMax)
  limit?: number;
}
