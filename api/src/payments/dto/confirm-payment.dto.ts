// Тело POST /payments/:userId/:month/confirm — оба поля необязательны
// (ADR-0049: отметить оплату можно без суммы).
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { PAYMENT_LIMITS, type ConfirmPaymentInput } from '@xuanxue/shared';
import { OptionalNotNull, TrimString } from '../../common/validation';

export class ConfirmPaymentDto implements ConfirmPaymentInput {
  @OptionalNotNull()
  @IsInt()
  @Min(0)
  @Max(PAYMENT_LIMITS.amountMinorMax)
  amountMinor?: number;

  @OptionalNotNull()
  @TrimString()
  @IsString()
  @MaxLength(PAYMENT_LIMITS.note)
  note?: string;
}
