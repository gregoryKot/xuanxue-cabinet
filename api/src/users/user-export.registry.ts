// Что входит в выгрузку данных человека (ADR-0160, аудит 2026-09-29, M4) —
// вторая половина реестра удаления (user-data.registry.ts): удаление идёт по
// тем же моделям, поэтому у каждой из них здесь обязано быть решение. Ключи
// `Record<ExportedModel, …>` — тип от реестра удаления: новая модель во
// владении без записи здесь не соберётся (`tsc`), а user-export.registry.spec.ts
// ещё и сверяет поля схем — новое поле без решения роняет тест.
//
// На каждое поле схемы — одно из двух: `include` (человек имеет право его
// видеть) или `omit` с причиной. Выбирать «всё, кроме…» нельзя: новое поле
// с токеном или хешем ушло бы в файл молча. `userId`, `_id`, `__v` и метки
// времени решаются одинаково для всех и в списки не входят.
//
// Не входит по умолчанию три вида полей: технические секреты (хеши кодов,
// ключи push, идентификаторы файлов Telegram и R2), сведения о других
// людях (кто проверил работу, кто подтвердил оплату) и байты файлов —
// вместо них метаданные (тип, размер, даты) и срок хранения.
import {
  ANSWER_VIDEO_RETENTION,
  BACKUP_RETENTION_DAYS,
  EXAM_ATTEMPT_RETENTION_YEARS,
  NOTIFICATION_RETENTION_DAYS,
  PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS,
  PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS,
  formatDaysRu,
  formatYearsRu,
} from '@xuanxue/shared';
import { toStudentBlock } from '../exams/exam-attempt.mapper';
import type { AttemptBlockRecord } from '../exams/exam-attempt.schema';
import {
  USER_MODEL_NAME,
  type USER_OWNED_CASCADES,
  type UserOwnedCollection,
} from './user-data.registry';

/** Все модели, чьи данные попадают в выгрузку: сам аккаунт, владение по
 * `userId` и цели каскадов (байты скриншота оплаты не достать по `userId`). */
export type ExportedModel =
  | typeof USER_MODEL_NAME
  | UserOwnedCollection
  | (typeof USER_OWNED_CASCADES)[number]['model'];

export interface ExportSectionSpec {
  title: string;
  retention: string;
  include: readonly string[];
  omit: Readonly<Record<string, string>>;
  /** Правка записи после расшифровки, если часть поля показывать нельзя. */
  refine?: (record: Record<string, unknown>) => Record<string, unknown>;
}

const ATTEMPT_RETENTION = `${formatYearsRu(EXAM_ATTEMPT_RETENTION_YEARS)} после результата: после проверки работы или, если её не проверили, после сдачи`;
const ACCOUNT_RETENTION = 'Пока существует аккаунт';
const SHORT_LIVED_RETENTION = 'Живёт считаные минуты и удаляется сама';

// В снимке формы у варианта лежит `correct` — ключ верных ответов. Ученик его
// не видел и не увидит: выгрузку могут переслать самому ученику, а он сдаёт
// формы повторно. Остаётся ровно то, что показывал экран (toStudentBlock).
function withoutAnswerKey(record: Record<string, unknown>): Record<string, unknown> {
  const blocks = Array.isArray(record.blocks)
    ? (record.blocks as AttemptBlockRecord[])
    : [];
  return { ...record, blocks: blocks.map(toStudentBlock) };
}

const OTHER_PERSON = 'сведения о сотруднике школы, а не об этом человеке';
const TELEGRAM_FILE_ID = 'идентификатор файла в Telegram: по нему бот достаёт сам файл';
const SECRET_HASH = 'хеш одноразового секрета входа';
const INTERNAL_LINK = 'служебная ссылка на другую запись, ничего не говорящая человеку';

export const USER_EXPORT_SECTIONS: Record<ExportedModel, ExportSectionSpec> = {
  [USER_MODEL_NAME]: {
    title: 'Аккаунт',
    retention: ACCOUNT_RETENTION,
    include: [
      'name',
      'email',
      'pendingEmail',
      'telegramId',
      'googleId',
      'roles',
      'status',
      'lastLoginAt',
      'joinedViaInviteAt',
      'profileNamedAt',
      'noTelegramAt',
    ],
    omit: {},
  },
  NotificationPrefsRecord: {
    title: 'Настройки уведомлений',
    retention: ACCOUNT_RETENTION,
    include: ['overrides', 'paymentReminderDay', 'lessonScopeMode', 'lessonClassIds'],
    omit: {},
  },
  ExamAttemptRecord: {
    title: 'Попытки сдачи экзаменов',
    retention: ATTEMPT_RETENTION,
    include: [
      'examTitle',
      'attemptNo',
      'status',
      'blocks',
      'answers',
      'startedAt',
      'deadlineAt',
      'submittedAt',
      'expired',
    ],
    omit: {
      examId: 'ссылка на форму: название формы уже стоит в examTitle',
      imageIds: 'копия id картинок формы, нужна для проверки доступа',
      videoIds: 'копия id видео формы, нужна для проверки доступа',
    },
    refine: withoutAnswerKey,
  },
  ExamGradingRecord: {
    title: 'Оценки и комментарии учителя',
    retention: ATTEMPT_RETENTION,
    include: ['attemptId', 'outcome', 'comment', 'gradedAt'],
    omit: {
      examId: INTERNAL_LINK,
      graderId: OTHER_PERSON,
    },
  },
  MediaAssetRecord: {
    title: 'Видео в ответах на экзамены',
    retention: `Вместе с попыткой: ${ATTEMPT_RETENTION}`,
    include: [
      'attemptId',
      'itemId',
      'kind',
      'telegramType',
      'durationSec',
      'sizeBytes',
      'url',
      'note',
      'receivedAt',
    ],
    omit: {
      fileId: TELEGRAM_FILE_ID,
      fileUniqueId: TELEGRAM_FILE_ID,
      answerVideoId: INTERNAL_LINK,
    },
  },
  AnswerVideoRecord: {
    title: 'Видео-ответы, загруженные в кабинет (сами файлы не входят)',
    retention: `${formatDaysRu(ANSWER_VIDEO_RETENTION.afterGradedDays)} после проверки работы и ${formatDaysRu(ANSWER_VIDEO_RETENTION.ungradedDays)}, если её так и не проверили`,
    include: ['attemptId', 'itemId', 'contentType', 'sizeBytes', 'status', 'completedAt'],
    omit: {
      key: 'адрес объекта в хранилище файлов',
      uploadId: 'служебный номер загрузки частями',
      parts: 'служебные отметки принятых частей файла',
      fingerprint: 'служебный отпечаток файла для продолжения загрузки',
    },
  },
  PaymentRecord: {
    title: 'Оплаты',
    retention: ACCOUNT_RETENTION,
    include: [
      'month',
      'status',
      'amountMinor',
      'confirmedAt',
      'screenshotKind',
      'screenshotAt',
      'reminderSentAt',
      'note',
    ],
    omit: {
      confirmedBy: OTHER_PERSON,
      screenshotFileId: TELEGRAM_FILE_ID,
      screenshotFileUniqueId: TELEGRAM_FILE_ID,
      screenshotImageId: INTERNAL_LINK,
    },
  },
  PaymentScreenshotRecord: {
    title: 'Скриншоты переводов (сами файлы не входят)',
    retention: `${formatDaysRu(PAYMENT_SCREENSHOT_TTL_AFTER_CONFIRM_DAYS)} после подтверждения оплаты и ${formatDaysRu(PAYMENT_SCREENSHOT_TTL_UNCONFIRMED_DAYS)}, если её так и не подтвердили`,
    include: ['contentType', 'sizeBytes'],
    omit: { bytes: 'сам снимок: на нём реквизиты, в файл выгрузки они не идут' },
  },
  NotificationRecord: {
    title: 'Уведомления в кабинете',
    retention: `${formatDaysRu(NOTIFICATION_RETENTION_DAYS)} после появления`,
    include: [
      'kind',
      'examTitle',
      'lessonTitle',
      'paymentMonth',
      'outcome',
      'readAt',
      'dismissedAt',
    ],
    omit: {
      examId: INTERNAL_LINK,
      attemptId: INTERNAL_LINK,
      lessonId: INTERNAL_LINK,
    },
  },
  ExamSeenMarkRecord: {
    title: 'Отметки «задание открыто»',
    retention: ACCOUNT_RETENTION,
    include: ['examId'],
    omit: {},
  },
  PushSubscriptionRecord: {
    title: 'Устройства с включёнными уведомлениями',
    retention: 'Пока существует аккаунт или пока браузер не отпишется',
    include: [],
    omit: {
      endpoint: 'адрес службы push браузера: по нему и ключам можно слать на устройство',
      p256dh: 'ключ доставки push',
      auth: 'ключ доставки push',
    },
  },
  TelegramLinkCodeRecord: {
    title: 'Код связки с Telegram',
    retention: SHORT_LIVED_RETENTION,
    include: ['expiresAt'],
    omit: { codeHash: SECRET_HASH },
  },
  EmailLinkTokenRecord: {
    title: 'Подтверждение почты',
    retention: SHORT_LIVED_RETENTION,
    include: ['email', 'expiresAt'],
    omit: { tokenHash: SECRET_HASH },
  },
};

/** Ссылки на человека в данных школы — только число записей (что и где он
 * ведёт или создал). Сами записи — данные школы или других людей. Сверка с
 * USER_REFERENCE_PATHS — user-export.registry.spec.ts. */
export const USER_EXPORT_REFERENCES = [
  { model: 'ClassRecord', path: 'leaderId', title: 'Классы, где указан ведущим' },
  { model: 'LessonRecord', path: 'leaderId', title: 'Занятия, где указан ведущим' },
  { model: 'ChannelRecord', path: 'createdBy', title: 'Каналы, которые завёл' },
  { model: 'BroadcastRecord', path: 'createdBy', title: 'Рассылки, которые создал' },
  {
    model: 'ExamItemRecord',
    path: 'authorId',
    title: 'Вопросы к экзаменам, где указан автором',
  },
  { model: 'ExamRecord', path: 'createdBy', title: 'Экзамены, которые создал' },
  {
    model: 'ExamGradingRecord',
    path: 'graderId',
    title: 'Работы других людей, которые проверил',
  },
  {
    model: 'ExamImageRecord',
    path: 'createdBy',
    title: 'Картинки к вопросам, которые загрузил',
  },
  {
    model: 'ExamVideoRecord',
    path: 'createdBy',
    title: 'Видео к вопросам, которые загрузил',
  },
  {
    model: 'GradingCommentPresetRecord',
    path: 'createdBy',
    title: 'Заготовки комментариев, которые завёл',
  },
  { model: 'MaterialRecord', path: 'createdBy', title: 'Материалы, которые добавил' },
  {
    model: 'PaymentRecord',
    path: 'confirmedBy',
    title: 'Оплаты других людей, которые подтвердил',
  },
] as const;

export const USER_EXPORT_NOTE =
  'Здесь всё, что кабинет школы хранит об этом человеке. Скриншоты переводов и видео-ответы описаны ' +
  'данными о файле: сами файлы в выгрузку не входят. Сведения о других людях тоже: кто проверил работу ' +
  'и кто подтвердил оплату. Даты — по Гринвичу (UTC). Ночные копии базы живут до ' +
  `${formatDaysRu(BACKUP_RETENTION_DAYS)} и отдельно не разбираются.`;
