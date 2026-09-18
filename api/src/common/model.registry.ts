// Единая точка для тестов-сверок: шифрование (encryption-coverage.spec),
// userId-реестр (user-data.registry.spec), уникальные индексы
// (model.registry.spec). Скрипт ротации ключа (RUNBOOK §6.1 шаг 3) обязан
// обходить этот список и брать `encryptSchemaFrom(fieldPolicy)` для каждой
// модели — другого реестра шифруемых полей в проекте нет.
import type { Schema } from 'mongoose';
import { ClassRecord, ClassSchema, CLASS_FIELD_POLICY } from '../classes/class.schema';
import {
  LessonRecord,
  LessonSchema,
  LESSON_FIELD_POLICY,
} from '../lessons/lesson.schema';
import {
  ChannelRecord,
  ChannelSchema,
  CHANNEL_FIELD_POLICY,
} from '../channels/channel.schema';
import {
  BroadcastRecord,
  BroadcastSchema,
  BROADCAST_FIELD_POLICY,
} from '../broadcasts/broadcast.schema';
import {
  DeliveryRecord,
  DeliverySchema,
  DELIVERY_FIELD_POLICY,
} from '../deliveries/delivery.schema';
import {
  ExamItemRecord,
  ExamItemSchema,
  EXAM_ITEM_FIELD_POLICY,
} from '../exams/exam-item.schema';
import { ExamRecord, ExamSchema, EXAM_FIELD_POLICY } from '../exams/exam.schema';
import {
  ExamAttemptRecord,
  ExamAttemptSchema,
  EXAM_ATTEMPT_FIELD_POLICY,
} from '../exams/exam-attempt.schema';
import {
  ExamGradingRecord,
  ExamGradingSchema,
  EXAM_GRADING_FIELD_POLICY,
} from '../exams/exam-grading.schema';
import { UserRecord, UserSchema, USER_FIELD_POLICY } from '../users/user.schema';
import {
  InviteLinkRecord,
  InviteLinkSchema,
  INVITE_LINK_FIELD_POLICY,
} from '../users/invite-link.schema';
import {
  EmailLoginTokenRecord,
  EmailLoginTokenSchema,
  EMAIL_LOGIN_TOKEN_FIELD_POLICY,
} from '../auth/email-login-token.schema';
import {
  TelegramLinkCodeRecord,
  TelegramLinkCodeSchema,
  TELEGRAM_LINK_CODE_FIELD_POLICY,
} from '../users/telegram-link-code.schema';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
  NOTIFICATION_PREFS_FIELD_POLICY,
} from '../notifications/notification-prefs.schema';
import {
  SettingsRecord,
  SettingsSchema,
  SETTINGS_FIELD_POLICY,
} from '../settings/settings.schema';
import {
  BotSessionRecord,
  BotSessionSchema,
  BOT_SESSION_FIELD_POLICY,
} from '../telegram/bot-session.schema';
import {
  MediaAssetRecord,
  MediaAssetSchema,
  MEDIA_ASSET_FIELD_POLICY,
} from '../media/media-asset.schema';
import {
  ExamImageRecord,
  ExamImageSchema,
  EXAM_IMAGE_FIELD_POLICY,
} from '../exam-images/exam-image.schema';
import {
  GradingCommentPresetRecord,
  GradingCommentPresetSchema,
  GRADING_COMMENT_PRESET_FIELD_POLICY,
} from '../grading-presets/grading-comment-preset.schema';
import {
  MaterialRecord,
  MaterialSchema,
  MATERIAL_FIELD_POLICY,
} from '../materials/material.schema';
import type { FieldPolicy } from './field-policy';

interface ModelDefinition {
  name: string;
  schema: Schema;
  fieldPolicy: FieldPolicy;
}

export const MODEL_DEFINITIONS: readonly ModelDefinition[] = [
  { name: ClassRecord.name, schema: ClassSchema, fieldPolicy: CLASS_FIELD_POLICY },
  { name: LessonRecord.name, schema: LessonSchema, fieldPolicy: LESSON_FIELD_POLICY },
  { name: ChannelRecord.name, schema: ChannelSchema, fieldPolicy: CHANNEL_FIELD_POLICY },
  {
    name: BroadcastRecord.name,
    schema: BroadcastSchema,
    fieldPolicy: BROADCAST_FIELD_POLICY,
  },
  {
    name: DeliveryRecord.name,
    schema: DeliverySchema,
    fieldPolicy: DELIVERY_FIELD_POLICY,
  },
  {
    name: ExamItemRecord.name,
    schema: ExamItemSchema,
    fieldPolicy: EXAM_ITEM_FIELD_POLICY,
  },
  { name: ExamRecord.name, schema: ExamSchema, fieldPolicy: EXAM_FIELD_POLICY },
  {
    name: ExamAttemptRecord.name,
    schema: ExamAttemptSchema,
    fieldPolicy: EXAM_ATTEMPT_FIELD_POLICY,
  },
  {
    name: ExamGradingRecord.name,
    schema: ExamGradingSchema,
    fieldPolicy: EXAM_GRADING_FIELD_POLICY,
  },
  { name: UserRecord.name, schema: UserSchema, fieldPolicy: USER_FIELD_POLICY },
  {
    name: InviteLinkRecord.name,
    schema: InviteLinkSchema,
    fieldPolicy: INVITE_LINK_FIELD_POLICY,
  },
  {
    name: EmailLoginTokenRecord.name,
    schema: EmailLoginTokenSchema,
    fieldPolicy: EMAIL_LOGIN_TOKEN_FIELD_POLICY,
  },
  {
    name: TelegramLinkCodeRecord.name,
    schema: TelegramLinkCodeSchema,
    fieldPolicy: TELEGRAM_LINK_CODE_FIELD_POLICY,
  },
  {
    name: NotificationPrefsRecord.name,
    schema: NotificationPrefsSchema,
    fieldPolicy: NOTIFICATION_PREFS_FIELD_POLICY,
  },
  {
    name: SettingsRecord.name,
    schema: SettingsSchema,
    fieldPolicy: SETTINGS_FIELD_POLICY,
  },
  {
    name: BotSessionRecord.name,
    schema: BotSessionSchema,
    fieldPolicy: BOT_SESSION_FIELD_POLICY,
  },
  {
    name: MediaAssetRecord.name,
    schema: MediaAssetSchema,
    fieldPolicy: MEDIA_ASSET_FIELD_POLICY,
  },
  {
    name: ExamImageRecord.name,
    schema: ExamImageSchema,
    fieldPolicy: EXAM_IMAGE_FIELD_POLICY,
  },
  {
    name: GradingCommentPresetRecord.name,
    schema: GradingCommentPresetSchema,
    fieldPolicy: GRADING_COMMENT_PRESET_FIELD_POLICY,
  },
  {
    name: MaterialRecord.name,
    schema: MaterialSchema,
    fieldPolicy: MATERIAL_FIELD_POLICY,
  },
];
