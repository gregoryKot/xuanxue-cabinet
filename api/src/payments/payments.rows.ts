// Сборка строк «Оплат» — один активный ученик = одна строка, даже если
// документа payments за месяц ещё нет (ADR-0049: «не оплачен» — такой же
// ответ, как «оплачен», Маша должна видеть молчащих). Чистая функция без
// Mongo (CLAUDE.md «Тесты»): запросы — payments.queries.ts, сборка — здесь,
// юнит-тест — payments.rows.spec.ts.
import type { PaymentDto, PaymentStatus } from '@xuanxue/shared';

export interface ActiveStudent {
  id: string;
  name: string;
}

/** Строка оплаты одного ученика за месяц — уже без Mongo-типов (сервис
 * переводит расшифрованный документ в эту форму перед вызовом
 * `buildPaymentRows`, payments.queries.ts). */
export interface PaymentRowData {
  status: PaymentStatus;
  amountMinor?: number;
  confirmedAt?: string;
  hasScreenshot: boolean;
  reminderSentAt?: string;
}

/** «Не оплачен» без документа — та же форма, что и явный `unpaid` из базы,
 * переиспользуется и здесь (студент без документа), и в PaymentsService.revoke
 * (документ удалён целиком — месяц снова «не оплачен»). */
export function unpaidDto(student: ActiveStudent, month: string): PaymentDto {
  return {
    userId: student.id,
    userName: student.name,
    month,
    status: 'unpaid',
    hasScreenshot: false,
  };
}

/**
 * Строка на каждого активного ученика месяца — у кого документа нет,
 * `unpaidDto` вместо пропуска строки (ADR-0049). Фильтр по `status` и
 * лимит — уже после сборки (docs/PLAN.md §15: «Фильтр по status применяется
 * уже к собранным строкам»), а не до: иначе лимит мог бы вернуть меньше
 * строк, чем реально подходит под фильтр.
 */
export function buildPaymentRows(
  students: readonly ActiveStudent[],
  paymentsByUserId: ReadonlyMap<string, PaymentRowData>,
  month: string,
  statusFilter: PaymentStatus | undefined,
  limit: number,
): PaymentDto[] {
  const rows = students.map((student): PaymentDto => {
    const data = paymentsByUserId.get(student.id);
    if (!data) return unpaidDto(student, month);
    return {
      userId: student.id,
      userName: student.name,
      month,
      status: data.status,
      amountMinor: data.amountMinor,
      confirmedAt: data.confirmedAt,
      hasScreenshot: data.hasScreenshot,
      reminderSentAt: data.reminderSentAt,
    };
  });
  const filtered = statusFilter
    ? rows.filter((row) => row.status === statusFilter)
    : rows;
  return filtered.slice(0, limit);
}
