// Общие типы и константы для api и web (CLAUDE.md, раздел «Структура и слои»:
// общий код — сразу в shared, а не копипастой между пакетами).

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
  WEEKDAY_LABELS_RU,
  CHANNEL_TYPES,
  CLASS_FORMATS,
  LESSON_STATUSES,
  BROADCAST_KINDS,
  BROADCAST_STATUSES,
  DELIVERY_STATUSES,
  DELIVERY_RETRY_DELAYS_MIN,
  DELIVERY_STALE_LOCK_MIN,
  SCHOOL_TZ,
  RULE_TIME_RE,
  DEFAULT_LEAD_MINUTES,
  PLANNING_HORIZON_WEEKS,
  DEFAULT_PREVIEW_MINUTES,
  DEFAULT_NEWCOMER_CONTACT,
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
export { type PluralForms, pluralRu } from './plural-ru';
export type { TagSummaryDto, ListTagsQuery } from './tags';
export { TAG_LIMITS, normalizeTags, parseTagsText } from './tags';
export type {
  UserRole,
  UserStatus,
  TelegramLoginInput,
  RequestEmailLoginInput,
  VerifyEmailLoginInput,
  AuthConfigDto,
} from './auth';
export type { MeDto, SetNoTelegramInput } from './me';
export type { VerifyEmailCodeInput } from './email-login-code';
export {
  EMAIL_LOGIN_CODE_LENGTH,
  EMAIL_LOGIN_CODE_RE,
  EMAIL_LOGIN_CODE_INVALID_MESSAGE,
} from './email-login-code';
export type { LinkEmailInput, ConfirmEmailInput } from './email-link';
export {
  EMAIL_CONFIRM_TOKEN_RE,
  EMAIL_LINK_TAKEN_MESSAGE,
  EMAIL_LINK_OTHER_EMAIL_MESSAGE,
  EMAIL_CONFIRM_RESEND_TOO_SOON_MESSAGE,
  EMAIL_CONFIRM_EXPIRED_MESSAGE,
} from './email-link';
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
export type { UpdateMyProfileInput } from './person-name';
export {
  NEW_PERSON_NAME,
  PERSON_NAME_PART_MAX,
  joinPersonName,
  splitPersonName,
} from './person-name';
export { APP_VERSION_HEADER } from './app-version';
export { CSRF_HEADER, isMutatingMethod } from './csrf';
export type { ClientErrorKind, ReportClientErrorInput } from './client-errors';
export {
  CLIENT_ERROR_KINDS,
  CLIENT_ERROR_LIMITS,
  CLIENT_ERROR_PATH_RE,
  clampClientErrorText,
} from './client-errors';
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
  ArchivedRecordingDto,
  MyArchivedLessonDto,
  ListMyArchivedLessonsQuery,
} from './my-lessons-archive';
export type {
  ExamItemKind,
  ExamItemStatus,
  ExamItemOptionDto,
  ExamItemOptionInput,
  ExamItemDto,
  CreateExamItemInput,
  UpdateExamItemInput,
  ListExamItemsQuery,
} from './exam-items';
export {
  EXAM_ITEM_KINDS,
  EXAM_ITEM_STATUSES,
  NULLABLE_EXAM_ITEM_FIELDS,
  EXAM_ITEM_LIMITS,
  EXAM_ITEM_NOT_FOUND_MESSAGE,
  OPTION_TEXT_OR_IMAGE_MESSAGE,
} from './exam-items';
export type {
  ExamStatus,
  ExamBlockDto,
  ExamBlockInput,
  ExamDto,
  CreateExamInput,
  UpdateExamInput,
  ListExamsQuery,
} from './exams';
export { formatOptionLabel } from './exam-option-label';
export {
  EXAM_STATUSES,
  NULLABLE_EXAM_FIELDS,
  EXAM_LIMITS,
  EXAM_NOT_FOUND_MESSAGE,
  EXAM_DUE_PASSED_MESSAGE,
} from './exams';
export type {
  ExamAttemptStatus,
  AttemptOptionDto,
  AttemptQuestionDto,
  AttemptBlockDto,
  AttemptAnswerDto,
  ExamAttemptDto,
  ExamAttemptCountDto,
  SaveAttemptAnswersInput,
  ListAttemptsQuery,
} from './exam-attempts';
export {
  EXAM_ATTEMPT_STATUSES,
  ATTEMPT_LIMITS,
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_NOT_PUBLISHED_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_UNKNOWN_ITEM_MESSAGE,
  ATTEMPT_SAVE_CONFLICT_MESSAGE,
} from './exam-attempts';
export {
  type ExamMediaKind,
  type ExamMediaDto,
  type AddExamMediaLinkInput,
  type AddExamMediaManualInput,
  EXAM_MEDIA_KINDS,
  EXAM_MEDIA_LIMITS,
  EXAM_MEDIA_INVALID_URL_MESSAGE,
  EXAM_MEDIA_ATTEMPT_GRADED_MESSAGE,
  EXAM_MEDIA_LINK_RACE_MESSAGE,
  EXAM_MEDIA_ITEM_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_NOT_FOUND_MESSAGE,
  EXAM_MEDIA_NO_BOT_CHAT_MESSAGE,
  EXAM_MEDIA_SEND_FAILED_MESSAGE,
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
export { FILE_STORAGE_OFF_MESSAGE, FILE_STORAGE_FAILED_MESSAGE } from './file-store';
export type { MaterialFileContentType, MaterialFileDto } from './material-files';
export {
  MATERIAL_FILE_CONTENT_TYPES,
  MATERIAL_FILE_DOCX_CONTENT_TYPE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_NOT_FOUND_MESSAGE,
} from './material-files';
export type { ExamItemStatsDto, ExamItemStatsSummaryDto } from './exam-item-stats';
export type { MyExamDto, ListMyExamsQuery, MyExamAction } from './my-exams';
export {
  myExamAttemptsLeft,
  getMyExamAction,
  firstUnansweredQuestionIndex,
} from './my-exams';
export { describeExamTime, describeAttemptDeadline, isExamDuePassed } from './exam-time';
export {
  EXAM_IN_PROGRESS_LABEL,
  EXAM_START_CONFIRM_TITLE,
  EXAM_START_CONFIRM_LABEL,
  EXAM_START_CANCEL_LABEL,
  buildExamStartWarning,
} from './exam-time-notice';
export type {
  AttemptOptionCheckDto,
  AttemptReviewOptionDto,
  AttemptReviewQuestionDto,
  AttemptReviewBlockDto,
  AttemptReviewDto,
  GradingOutcome,
  PutGradingInput,
  ExamGradingDto,
} from './exam-grading';
export {
  GRADING_OUTCOMES,
  DELETED_USER_NAME,
  GRADING_LIMITS,
  ATTEMPT_NOT_SUBMITTED_MESSAGE,
  ATTEMPT_NO_ANSWER_TEXT,
} from './exam-grading';
export {
  NULLABLE_LESSON_FIELDS,
  LESSON_LIMITS,
  LESSON_DEFAULT_DURATION_MIN,
  MY_LESSONS_LIMIT_DEFAULT,
  MY_LESSONS_LIMIT_MAX,
} from './lessons';
export { MY_ARCHIVE_LIMIT_DEFAULT, MY_ARCHIVE_LIMIT_MAX } from './my-lessons-archive';
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
export type { LessonRecordingSummaryDto } from './lesson-recording-summary';
export {
  RECORDING_SUMMARY_PERIOD_DAYS,
  formatRecordingSummary,
} from './lesson-recording-summary';
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
  rolesWithNotification,
} from './notifications';
export type { NotificationDto, ListInboxQuery, InboxPageDto } from './inbox';
export { INBOX_ITEM_NOT_FOUND_MESSAGE } from './inbox';
export type {
  GradingCommentPresetDto,
  CreateGradingCommentPresetInput,
  UpdateGradingCommentPresetInput,
  ListGradingCommentPresetsQuery,
} from './grading-comment-preset';
export {
  GRADING_COMMENT_PRESET_LIMITS,
  GRADING_COMMENT_PRESET_NOT_FOUND_MESSAGE,
} from './grading-comment-preset';
export type {
  MaterialKind,
  MaterialAccess,
  MaterialDto,
  CreateMaterialInput,
  UpdateMaterialInput,
  ListMaterialsQuery,
  MyMaterialDto,
  ListMyMaterialsQuery,
} from './materials';
export {
  MATERIAL_KINDS,
  MATERIAL_KIND_LABELS,
  MATERIAL_ACCESS_LEVELS,
  MATERIAL_ACCESS_LABELS,
  MATERIAL_LIMITS,
  MATERIAL_MAX_CLASS_IDS,
  MATERIAL_MAX_LESSON_IDS,
  MATERIAL_NOT_FOUND_MESSAGE,
  MATERIALS_LIMIT_DEFAULT,
  MY_MATERIALS_LIMIT_DEFAULT,
  MY_MATERIALS_LIMIT_MAX,
} from './materials';
export type {
  PaymentStatus,
  PaymentDto,
  MyPaymentDto,
  PaymentsPageDto,
  ListPaymentsQuery,
  ConfirmPaymentInput,
} from './payments';
export {
  PAYMENT_STATUSES,
  MONTH_KEY_RE,
  isMonthKey,
  PAYMENT_TELEGRAM_START_PREFIX,
  formatMonthRu,
  shiftMonth,
  PAYMENT_LIMITS,
  PAYMENT_MONTH_INVALID_MESSAGE,
  PAYMENT_STUDENT_NOT_FOUND_MESSAGE,
  PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE,
  PAYMENT_NOTHING_TO_REVOKE_MESSAGE,
} from './payments';
export type {
  SubscribePushInput,
  UnsubscribePushInput,
  PushSubscriptionDto,
  PushPublicKeyDto,
} from './push';
export {
  PUSH_SUBSCRIPTION_LIMITS,
  PUSH_SUBSCRIPTION_KEY_RE,
  PUSH_NOT_AVAILABLE_MESSAGE,
} from './push';
export { videoEmbedUrl } from './video-embed';
