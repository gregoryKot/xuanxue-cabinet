// Единственный маппер SettingsRecord (lean) → SettingsDto (CLAUDE.md,
// раздел «API»: документ Mongoose наружу не возвращается) — вынесен из
// settings.service.ts ради лимита файла (CLAUDE.md «Храповики», 150 строк).
import {
  DEFAULT_LESSON_REMINDER_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  DEFAULT_PREVIEW_MINUTES,
  type PaymentReminderSettings,
  type SettingsDto,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { SettingsRecord } from './settings.schema';

export type LeanSettings = Pick<
  SettingsRecord,
  | 'templates'
  | 'tz'
  | 'schoolSiteUrl'
  | 'previewMinutes'
  | 'lessonReminderMinutes'
  | 'newcomerContact'
  | 'paymentContact'
  | 'dataControllerName'
  | 'dataControllerContact'
  | 'paymentReminder'
> & {
  updatedAt: Date;
};

/** Поле за полем, а не «подобъект целиком или дефолт»: `$set` по точечному
 * пути в старой базе создаёт подобъект с одним полем, остальные должны прийти
 * из дефолта, не undefined (ADR-0051). */
function toPaymentReminder(
  doc: LeanSettings['paymentReminder'],
): PaymentReminderSettings {
  return {
    enabled: doc?.enabled ?? DEFAULT_PAYMENT_REMINDER.enabled,
    time: doc?.time ?? DEFAULT_PAYMENT_REMINDER.time,
    template: doc?.template ?? DEFAULT_PAYMENT_REMINDER.template,
  };
}

export function toSettingsDto(doc: LeanSettings): SettingsDto {
  return {
    templates: {
      lesson_link: doc.templates.lessonLink,
      recording: doc.templates.recording,
    },
    tz: doc.tz,
    schoolSiteUrl: doc.schoolSiteUrl,
    // Старая база без поля (до этой настройки) — дефолт, не undefined/NaN
    // (docs/PLAN.md §6, CLAUDE.md «Кабинет учителя: всё настраивается в
    // интерфейсе» — значение живёт в БД, но пустая база не должна ломать
    // поведение, которое раньше держала константа).
    previewMinutes: doc.previewMinutes ?? DEFAULT_PREVIEW_MINUTES,
    // Та же причина, что у previewMinutes выше: старая база без поля —
    // дефолт (DEFAULT_LESSON_REMINDER_MINUTES, domain.ts), не undefined.
    lessonReminderMinutes: doc.lessonReminderMinutes ?? DEFAULT_LESSON_REMINDER_MINUTES,
    // Та же причина, что у previewMinutes выше: старая база без поля —
    // дефолт (DEFAULT_NEWCOMER_CONTACT, domain.ts), не undefined.
    newcomerContact: doc.newcomerContact ?? DEFAULT_NEWCOMER_CONTACT,
    // Та же причина: старая база без поля — DEFAULT_PAYMENT_CONTACT (domain.ts).
    paymentContact: doc.paymentContact ?? DEFAULT_PAYMENT_CONTACT,
    // Без дефолта: выдуманное имя ответственного хуже пустого (страница
    // /privacy честно отправляет к учителю, пока поля нет).
    dataControllerName: doc.dataControllerName,
    dataControllerContact: doc.dataControllerContact,
    paymentReminder: toPaymentReminder(doc.paymentReminder),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
