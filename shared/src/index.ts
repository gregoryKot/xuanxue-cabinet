// Общие типы и константы для api и web (CLAUDE.md, раздел «Структура и слои»:
// общий код — сразу в shared, а не копипастой между пакетами).

import type { Weekday } from './domain';

export type { ApiErrorBody, ApiErrorCode } from './api-error';
export type {
  Weekday,
  ChannelType,
  ClassFormat,
  LessonStatus,
  BroadcastKind,
  BroadcastStatus,
  DeliveryStatus,
  ScheduleRule,
  Recording,
} from './domain';
export {
  WEEKDAYS,
  CHANNEL_TYPES,
  CLASS_FORMATS,
  LESSON_STATUSES,
  BROADCAST_KINDS,
  BROADCAST_STATUSES,
  DELIVERY_STATUSES,
  DELIVERY_RETRY_DELAYS_MIN,
  DELIVERY_STALE_LOCK_MIN,
  RULE_TIME_RE,
  DEFAULT_LEAD_MINUTES,
  PLANNING_HORIZON_WEEKS,
  DEFAULT_PREVIEW_MINUTES,
} from './domain';
export type { TemplatePlaceholder, TemplateValues } from './templates';
export {
  TEMPLATE_PLACEHOLDERS,
  renderTemplate,
  findUnknownPlaceholders,
} from './templates';
export type { TemplateKind } from './default-templates';
export { TEMPLATE_KINDS, DEFAULT_TEMPLATES } from './default-templates';
export { formatDurationRu } from './format-duration';
export type { PluralForms } from './plural-ru';
export { pluralRu } from './plural-ru';
export type {
  UserRole,
  UserStatus,
  MeDto,
  TelegramLoginInput,
  RequestEmailLoginInput,
  VerifyEmailLoginInput,
  AuthConfigDto,
} from './auth';
export {
  USER_ROLES,
  ROLE_LABELS,
  isStaffRole,
  USER_STATUSES,
  NO_INVITE_LINK_MESSAGE,
  ACCESS_MESSAGE,
  EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE,
  EMAIL_LOGIN_EXPIRED_MESSAGE,
  EMAIL_LOGIN_SEND_FAILED_MESSAGE,
} from './auth';
export { CSRF_HEADER, isMutatingMethod } from './csrf';
export type {
  ClassDto,
  CreateClassInput,
  UpdateClassInput,
  ListClassesQuery,
  ScheduleRuleDto,
  ScheduleRuleInput,
} from './classes';
export {
  CLASS_LIMITS,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  NULLABLE_CLASS_FIELDS,
  CLASS_NOT_FOUND_MESSAGE,
} from './classes';
export type {
  RecordingDto,
  LessonDto,
  ListLessonsQuery,
  CreateLessonInput,
  UpdateLessonInput,
  AddRecordingInput,
  MyLessonDto,
  ListMyLessonsQuery,
} from './lessons';
export type {
  ExamItemKind,
  ExamItemStatus,
  ExamItemOptionDto,
  ExamItemOptionInput,
  ExamItemDto,
  CreateExamItemInput,
  UpdateExamItemInput,
  ListExamItemsQuery,
  ExamStatus,
  ExamBlockDto,
  ExamBlockInput,
  ExamDto,
  CreateExamInput,
  UpdateExamInput,
  ListExamsQuery,
  ExamAttemptStatus,
  AttemptOptionDto,
  AttemptQuestionDto,
  AttemptBlockDto,
  AttemptAnswerDto,
  ExamAttemptDto,
  SaveAttemptAnswersInput,
  ListAttemptsQuery,
} from './exams';
export { formatOptionLabel } from './exam-option-label';
export {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_STATUSES,
  NULLABLE_EXAM_ITEM_FIELDS,
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_NOT_FOUND_MESSAGE,
  OPTION_TEXT_OR_IMAGE_MESSAGE,
  EXAM_STATUSES,
  NULLABLE_EXAM_FIELDS,
  EXAM_LIMITS,
  EXAM_NOT_FOUND_MESSAGE,
  EXAM_ATTEMPT_STATUSES,
  ATTEMPT_LIMITS,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_NOT_PUBLISHED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_UNKNOWN_ITEM_MESSAGE,
} from './exams';
export type {
  RubricCriterionDto,
  RubricCriterionInput,
  GradingOutcome,
  GradingCriterionDto,
} from './exam-rubric';
export { DEFAULT_RUBRIC, GRADING_OUTCOMES } from './exam-rubric';
export {
  type ExamMediaKind,
  type ExamMediaDto,
  type AddExamMediaLinkInput,
  type AddExamMediaManualInput,
  EXAM_MEDIA_KINDS,
  EXAM_MEDIA_LIMITS,
  EXAM_MEDIA_INVALID_URL_MESSAGE,
  EXAM_MEDIA_ALREADY_LINKED_MESSAGE,
} from './exam-media';
export type {
  ExamImageContentType,
  ExamImageDto,
  ExamImageStatsDto,
} from './exam-images';
export {
  EXAM_IMAGE_CONTENT_TYPES,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_NOT_FOUND_MESSAGE,
} from './exam-images';
export type { ExamItemStatsDto, ExamItemStatsSummaryDto } from './exam-item-stats';
export type { MyExamDto, ListMyExamsQuery } from './my-exams';
export type {
  AttemptOptionCheckDto,
  AttemptReviewOptionDto,
  AttemptReviewQuestionDto,
  AttemptReviewBlockDto,
  AttemptReviewDto,
  GradingCriterionInput,
  PutGradingInput,
  ExamGradingDto,
} from './exam-grading';
export {
  DELETED_USER_NAME,
  GRADING_LIMITS,
  ATTEMPT_NOT_SUBMITTED_MESSAGE,
  unknownCriterionMessage,
  invalidScoreMessage,
} from './exam-grading';
export {
  NULLABLE_LESSON_FIELDS,
  LESSON_LIMITS,
  LESSON_DEFAULT_DURATION_MIN,
  MY_LESSONS_LIMIT_DEFAULT,
  MY_LESSONS_LIMIT_MAX,
} from './lessons';
export type {
  ChannelConfig,
  ChannelDto,
  CreateChannelInput,
  UpdateChannelInput,
  ListChannelsQuery,
  ChannelTestResult,
} from './channels';
export {
  isTelegramChannelConfig,
  isVkChannelConfig,
  CHANNEL_LIMITS,
  CHANNEL_NOT_FOUND_MESSAGE,
} from './channels';
export type {
  BroadcastDto,
  DeliveryDto,
  CreateBroadcastInput,
  ListBroadcastsQuery,
  ListDeliveriesQuery,
} from './broadcasts';
export {
  BROADCAST_LIMITS,
  JOURNAL_RANGE_MAX_WEEKS,
  IDEMPOTENCY_KEY_LIMITS,
  IDEMPOTENCY_KEY_RE,
} from './broadcasts';
export type {
  SettingsDto,
  UpdateSettingsInput,
  PreviewTemplateInput,
  PreviewTemplateResult,
} from './settings';
export { SETTINGS_LIMITS, NULLABLE_SETTINGS_FIELDS } from './settings';
export type { SummaryDto } from './summary';
export { SUMMARY_PERIOD_DAYS } from './summary';
export {
  type UserDto,
  type ListUsersQuery,
  type UpdateUserRolesInput,
  type UpdateUserStatusInput,
  type TeacherOptionDto,
  USER_NOT_FOUND_MESSAGE,
  SELF_DEMOTE_MESSAGE,
  LAST_ADMIN_MESSAGE,
  SELF_BLOCK_MESSAGE,
  LAST_ADMIN_BLOCK_MESSAGE,
  SELF_DELETE_MESSAGE,
  LEADER_NOT_FOUND_MESSAGE,
} from './users';
export {
  type InviteLinkDto,
  type JoinByInviteInput,
  type CheckInviteResultDto,
  INVITE_CODE_RE,
  INVITE_TELEGRAM_START_PREFIX,
  INVITE_QUERY_PARAM,
  INVITE_LINK_NOT_AVAILABLE_MESSAGE,
  INVITE_LINK_INVALID_MESSAGE,
} from './invite-link';
export type { TelegramLinkCodeDto } from './telegram-link';
export {
  TELEGRAM_LINK_CODE_RE,
  TELEGRAM_LINK_START_PREFIX,
  TELEGRAM_LINK_NOT_AVAILABLE_MESSAGE,
  TELEGRAM_LINK_CODE_INVALID_MESSAGE,
  TELEGRAM_LINK_TAKEN_MESSAGE,
  TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE,
} from './telegram-link';
export { FIELD_LABELS_RU } from './field-labels';
export type {
  NotificationKind,
  NotificationPrefsDto,
  UpdateNotificationPrefsInput,
} from './notifications';
export {
  NOTIFICATION_KINDS,
  NOTIFICATION_LABELS,
  NOTIFICATION_HINTS,
  defaultNotifications,
  isNotificationKind,
} from './notifications';

/** Часовой пояс школы — правило расписания хранится в нём (docs/PLAN.md §3). */
export const SCHOOL_TZ = 'Asia/Jerusalem';

/** Короткие подписи дней недели, неделя начинается с воскресенья. */
export const WEEKDAY_LABELS_RU: Record<Weekday, string> = {
  0: 'Вс',
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
};
