// Раздел «Сколько хранятся» политики конфиденциальности (ADR-0155). Ни одно
// число здесь не написано руками: срок собирается из константы, по которой
// данные удаляются на самом деле (shared/) — поменяли срок в коде, поменялось
// обещание на странице. Гейт — privacyPolicyText.test.ts: подменяет константы
// и проверяет, что новое число дошло до текста.
import {
  ANSWER_VIDEO_RETENTION,
  APP_ERROR_LIMITS,
  BACKUP_RETENTION_DAYS,
  EXAM_ATTEMPT_RETENTION_YEARS,
  NOTIFICATION_RETENTION_DAYS,
  PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS,
  PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS,
  formatDaysRu,
  formatYearsRu,
} from '@xuanxue/shared';

const SCREENSHOT_AFTER_CONFIRM = formatDaysRu(PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS);
const SCREENSHOT_UNCONFIRMED = formatDaysRu(PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS);
const VIDEO_AFTER_GRADED = formatDaysRu(ANSWER_VIDEO_RETENTION.afterGradedDays);
const VIDEO_UNGRADED = formatDaysRu(ANSWER_VIDEO_RETENTION.ungradedDays);
const EXAM_ATTEMPT = formatYearsRu(EXAM_ATTEMPT_RETENTION_YEARS);
const NOTIFICATIONS = formatDaysRu(NOTIFICATION_RETENTION_DAYS);
const APP_ERRORS = formatDaysRu(APP_ERROR_LIMITS.retentionDays);
const BACKUPS = formatDaysRu(BACKUP_RETENTION_DAYS);

export const PRIVACY_RETENTION_PARAGRAPHS: readonly string[] = [
  'Профиль и статус оплаты — **пока существует аккаунт**.',
  `Ответы на экзамены и оценки — **${EXAM_ATTEMPT}** после результата: ` +
    'после проверки работы или, если её не проверили, после сдачи.',
  `Брошенную попытку экзамена, которую так и не сдали, удаляем через **${EXAM_ATTEMPT}** ` +
    'после последней правки.',
  `Скриншот перевода — **${SCREENSHOT_AFTER_CONFIRM}** после подтверждения оплаты ` +
    `и **${SCREENSHOT_UNCONFIRMED}**, если её так и не подтвердили. ` +
    'Копия, которую бот отправляет бухгалтеру в Telegram, остаётся в его чате, ' +
    'пока он сам её не удалит.',
  `Видео-ответы — **${VIDEO_AFTER_GRADED}** после проверки работы ` +
    `и **${VIDEO_UNGRADED}**, если работу так и не проверили.`,
  `Уведомления в кабинете — **${NOTIFICATIONS}**.`,
  `Журнал сбоев — **${APP_ERRORS}**.`,
  `Резервные копии базы — до **${BACKUPS}**. Удалённые по вашей просьбе данные ` +
    'исчезнут и из копий вместе с ними.',
];
