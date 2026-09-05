// Единая точка для тестов-сверок: шифрование (encryption-coverage.spec),
// userId-реестр (user-data.registry.spec), уникальные индексы
// (model.registry.spec). Тот же список — единственный реестр для скрипта
// ротации ключа (`rotate-encryption`, RUNBOOK §6.1 шаг 3): он берёт
// `encryptSchemaFrom(fieldPolicy)` отсюда для каждой модели, второго списка
// шифруемых полей в проекте нет.
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
];
