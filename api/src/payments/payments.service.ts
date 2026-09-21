// GET /payments, POST /payments/:userId/:month/confirm|revoke,
// GET /me/payments (docs/PLAN.md §15, ADR-0049). Владение и сборка строк —
// в payments.queries.ts/payments.rows.ts/payments.write.ts (файл-лимит
// CLAUDE.md «Храповики») — здесь только диспетчер, тестируется без HTTP.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  PAYMENT_LIMITS,
  type ConfirmPaymentInput,
  type ListPaymentsQuery,
  type MyPaymentDto,
  type PaymentDto,
  type PaymentsPageDto,
  type PaymentStatus,
} from '@xuanxue/shared';
import { SettingsService } from '../settings/settings.service';
import { UserRecord } from '../users/user.schema';
import { assertMonthKey, monthKeyOf } from './payment-month';
import {
  decryptPayment,
  toMyPaymentDto,
  toPaymentDto,
  type RawLeanPayment,
} from './payment.mapper';
import { PaymentRecord, type TelegramScreenshotSource } from './payment.schema';
import {
  assertActiveStudent,
  findPaymentsForMonth,
  listActiveStudents,
} from './payments.queries';
import { buildPaymentRows, unpaidDto } from './payments.rows';
import {
  attachTelegramScreenshot,
  confirmPayment,
  revokePayment,
} from './payments.write';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(PaymentRecord.name) private readonly model: Model<PaymentRecord>,
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    private readonly settingsService: SettingsService,
  ) {}

  /** Месяц из query или текущий в поясе школы (ADR-0049) — строка на
   * КАЖДОГО активного ученика, не только на тех, у кого есть документ. */
  async listMonth(query: ListPaymentsQuery, now: DateTime): Promise<PaymentsPageDto> {
    const settings = await this.settingsService.get();
    const month = query.month ?? monthKeyOf(now, settings.tz);
    assertMonthKey(month);

    const students = await listActiveStudents(this.userModel);
    const paymentsByUserId = await findPaymentsForMonth(
      this.model,
      month,
      students.map((s) => s.id),
    );
    const limit = query.limit ?? PAYMENT_LIMITS.listLimitDefault;
    const rows = buildPaymentRows(students, paymentsByUserId, month, query.status, limit);
    return { month, rows };
  }

  async confirm(
    userId: string,
    month: string,
    input: ConfirmPaymentInput,
    actorId: string,
    now: DateTime,
  ): Promise<PaymentDto> {
    assertMonthKey(month);
    const student = await assertActiveStudent(this.userModel, userId);
    const doc = await confirmPayment(this.model, userId, month, input, actorId, now);
    return toPaymentDto(doc, student.name);
  }

  async revoke(userId: string, month: string): Promise<PaymentDto> {
    assertMonthKey(month);
    const student = await assertActiveStudent(this.userModel, userId);
    const doc = await revokePayment(this.model, userId, month);
    return doc ? toPaymentDto(doc, student.name) : unpaidDto(student, month);
  }

  /** Скриншот из бота (ADR-0050, слой 2.2) — `userId` берётся из
   * разрешённой ботом идентичности (BotUserAccessService.resolve), НИКОГДА
   * из payload ссылки (SECURITY §3); `month` из ссылки — параметр, не
   * идентичность. Штату абонемент не заводим — та же assertActiveStudent,
   * что у confirm/revoke (ADR-0026). Возвращает итоговый статус: `paid` —
   * скриншот сохранили, но статус не тронули (ADR-0049), иначе — `awaiting`. */
  async attachScreenshot(
    userId: string,
    month: string,
    source: TelegramScreenshotSource,
    now: DateTime,
  ): Promise<PaymentStatus> {
    assertMonthKey(month);
    await assertActiveStudent(this.userModel, userId);
    const doc = await attachTelegramScreenshot(this.model, userId, month, source, now);
    return doc.status;
  }

  /** Свои месяцы, свежие сверху — владение по `userId` из сессии
   * (SECURITY §3), не по параметру пути. */
  async listMine(userId: string, limit?: number): Promise<MyPaymentDto[]> {
    const docs = await this.model
      .find({ userId })
      .sort({ month: -1 })
      .limit(limit ?? PAYMENT_LIMITS.listLimitDefault)
      .lean<RawLeanPayment[]>();
    return docs.map((doc) => toMyPaymentDto(decryptPayment(doc)));
  }
}
