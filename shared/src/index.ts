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
  AuthConfigDto,
} from './auth';
export {
  USER_ROLES,
  ROLE_LABELS,
  USER_STATUSES,
  CSRF_HEADER,
  MUTATING_METHODS,
  isMutatingMethod,
} from './auth';
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
  ExamItemVersionDto,
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
export {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_STATUSES,
  NULLABLE_EXAM_ITEM_FIELDS,
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_NOT_FOUND_MESSAGE,
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
export type { MyExamAttemptSummaryDto, MyExamDto, ListMyExamsQuery } from './my-exams';
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
  TelegramChannelConfig,
  VkChannelConfig,
  ManualChannelConfig,
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
export type { SummaryPeriod, SummaryDto } from './summary';
export { SUMMARY_PERIOD_DAYS } from './summary';
export type {
  UserDto,
  ListUsersQuery,
  UpdateUserRolesInput,
  TeacherOptionDto,
} from './users';
export {
  USER_NOT_FOUND_MESSAGE,
  SELF_DEMOTE_MESSAGE,
  LAST_ADMIN_MESSAGE,
  SELF_DELETE_MESSAGE,
  LEADER_NOT_FOUND_MESSAGE,
} from './users';
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
  DEFAULT_NOTIFICATIONS_BY_ROLE,
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
