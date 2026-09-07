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
import { UserRecord, UserSchema, USER_FIELD_POLICY } from '../users/user.schema';
import {
  SettingsRecord,
  SettingsSchema,
  SETTINGS_FIELD_POLICY,
} from '../settings/settings.schema';
import type { FieldPolicy } from './field-policy';

interface ModelDefinition {
  name: string;
  schema: Schema;
  fieldPolicy: FieldPolicy;
}

export const MODEL_DEFINITIONS: readonly ModelDefinition[] = [
  { name: ClassRecord.name, schema: ClassSchema, fieldPolicy: CLASS_FIELD_POLICY },
  { name: LessonRecord.name, schema: LessonSchema, fieldPolicy: LESSON_FIELD_POLICY },
  {
    name: ChannelRecord.name,
    schema: ChannelSchema,
    fieldPolicy: CHANNEL_FIELD_POLICY,
  },
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
  { name: UserRecord.name, schema: UserSchema, fieldPolicy: USER_FIELD_POLICY },
  {
    name: SettingsRecord.name,
    schema: SettingsSchema,
    fieldPolicy: SETTINGS_FIELD_POLICY,
  },
];
