// Запросы к users/payments для PaymentsService — вынесено отдельным файлом
// (файл-лимит CLAUDE.md «Храповики», тот же приём, что list-teacher-contacts.ts).
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  PAYMENT_LIMITS,
  PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE,
  PAYMENT_STUDENT_NOT_FOUND_MESSAGE,
  type UserRole,
  type UserStatus,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import type { UserRecord } from '../users/user.schema';
import { toIsoUtc } from '../common/iso-date';
import { decryptPayment, type RawLeanPayment } from './payment.mapper';
import type { PaymentRecord } from './payment.schema';
import type { ActiveStudent, PaymentRowData } from './payments.rows';

/** Активные ученики школы (ADR-0026: `status: 'active'`, без единой роли
 * учителя) — строка на каждого нужна `listMonth`, даже без документа
 * payments. Сортировка по имени — стабильный порядок списка на экране;
 * лимит — та же защита от «дай всё», что и у остальных списков
 * (CLAUDE.md «API»), внутренний запрос не исключение. */
export async function listActiveStudents(
  model: Model<UserRecord>,
): Promise<ActiveStudent[]> {
  const docs = await model
    .find({ status: 'active', roles: [] }, { name: 1 })
    .sort({ name: 1 })
    .limit(PAYMENT_LIMITS.listLimitMax)
    .lean<{ _id: Types.ObjectId; name: string }[]>();
  return docs.map((doc) => ({ id: doc._id.toString(), name: doc.name }));
}

/** Документы месяца по списку id, расшифрованные и переведённые в
 * `PaymentRowData` — один запрос на весь список (не N+1). */
export async function findPaymentsForMonth(
  model: Model<PaymentRecord>,
  month: string,
  userIds: readonly string[],
): Promise<Map<string, PaymentRowData>> {
  if (userIds.length === 0) return new Map();
  const docs = await model
    .find({ month, userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
    .lean<RawLeanPayment[]>();
  return new Map(
    docs.map((raw) => {
      const doc = decryptPayment(raw);
      const data: PaymentRowData = {
        status: doc.status,
        amountMinor: doc.amountMinor,
        confirmedAt: doc.confirmedAt ? toIsoUtc(doc.confirmedAt) : undefined,
        hasScreenshot: doc.screenshotKind != null,
        reminderSentAt: doc.reminderSentAt ? toIsoUtc(doc.reminderSentAt) : undefined,
      };
      return [doc.userId.toString(), data];
    }),
  );
}

/** Владелец абонемента — существующий активный ученик (docs/PLAN.md §15):
 * несуществующий или неактивный — как «не нашли» (не подтверждаем даже факт
 * существования, тот же приём, что у SECURITY §3). Ученик — человек без
 * единой роли (ADR-0026, `roles: []`), не только не-штат: `isStaffRole`
 * здесь не подходит — она не считает `accountant` штатом (STAFF_ROLES —
 * только teacher/assistant/admin, shared/src/auth.ts), а бухгалтеру
 * абонемент заводить так же не нужно, как и учителю. */
export async function assertActiveStudent(
  model: Model<UserRecord>,
  userId: string,
): Promise<ActiveStudent> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new NotFoundError(PAYMENT_STUDENT_NOT_FOUND_MESSAGE);
  }
  const doc = await model.findById(userId, { name: 1, status: 1, roles: 1 }).lean<{
    _id: Types.ObjectId;
    name: string;
    status: UserStatus;
    roles: UserRole[];
  } | null>();
  if (!doc || doc.status !== 'active') {
    throw new NotFoundError(PAYMENT_STUDENT_NOT_FOUND_MESSAGE);
  }
  if (doc.roles.length > 0) {
    throw new InvalidInputError(PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE);
  }
  return { id: doc._id.toString(), name: doc.name };
}
