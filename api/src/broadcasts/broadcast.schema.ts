// Рассылка (данные школы, ADR-0010): `text` содержит ссылку Zoom с паролем
// (SECURITY §1 п.3), шифруется целиком. `telegramFileId` — для рассылок
// записи видеофайлом, бот публикует по file_id без перезаливки (PLAN §6).
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import {
  BROADCAST_KINDS,
  BROADCAST_STATUSES,
  type BroadcastKind,
  type BroadcastStatus,
} from '@xuanxue/shared';
import { enc, plain, type FieldPolicy } from '../common/field-policy';
import { USER_MODEL_NAME } from '../users/user-data.registry';

@Schema({ timestamps: true, collection: 'broadcasts' })
export class BroadcastRecord {
  @Prop({ type: String, enum: BROADCAST_KINDS, required: true })
  kind!: BroadcastKind;

  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: Date, required: true })
  scheduledAt!: Date;

  @Prop({ type: [SchemaTypes.ObjectId], required: true })
  channelIds!: Types.ObjectId[];

  @Prop({ type: SchemaTypes.ObjectId, required: false })
  lessonId?: Types.ObjectId;

  @Prop({ type: String, enum: BROADCAST_STATUSES, default: 'scheduled' })
  status!: BroadcastStatus;

  // См. USER_REFERENCE_PATHS. У рассылки от планировщика (не от человека)
  // отсутствует.
  @Prop({ type: SchemaTypes.ObjectId, ref: USER_MODEL_NAME, required: false })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  sentAt?: Date;

  @Prop({ type: String, required: false })
  telegramFileId?: string;

  // Ключ идемпотентности рассылки записи (url или file_id — что из двух дала
  // AddRecordingInput, buildRecordingKey в recording-broadcast.service.ts):
  // url публикуется в самом посте, отдельным полем он нужен только затем,
  // чтобы искать по нему повторный вызов addRecording с тем же источником
  // (уникальный индекс ниже), не по факту изменения документа занятия.
  @Prop({ type: String, required: false })
  recordingKey?: string;

  // Бот шлёт предпросмотр с «Отменить»/«Изменить тему» один раз, не на
  // каждом тике планировщика.
  @Prop({ type: Date, required: false })
  previewSentAt?: Date;

  // DM учителю про автоматическую отмену (channelIds: [] — плейсхолдер от
  // insertCancelledPlaceholder, не ручная отмена учителем через «Рассылки»)
  // ставится раз на рассылку тем же приёмом, что previewSentAt (claimOnce,
  // BroadcastCancelNotifyService, docs/PLAN.md §6 «Планировщик»).
  @Prop({ type: Date, required: false })
  teacherNotifiedAt?: Date;
}

export const BroadcastSchema = SchemaFactory.createForClass(BroadcastRecord);
BroadcastSchema.index({ status: 1, scheduledAt: 1 });
// Сводка (`GET /summary`, docs/PLAN.md §6) считает `broadcastsSent` за
// период по `sentAt`, не по `scheduledAt` — своя пара индекс/запрос: та же
// (`status`, время) форма, что и выше, но `sentAt` есть только у `sent`.
BroadcastSchema.index({ status: 1, sentAt: 1 });
// Журнал (`GET /broadcasts?from&to&status?&kind?`, docs/PLAN.md §6) сортирует
// по scheduledAt desc и почти всегда без status/kind в фильтре — индекс выше
// начинается с status и не помогает сорту без него; отдельный индекс на
// голый scheduledAt закрывает именно эту форму запроса.
BroadcastSchema.index({ scheduledAt: -1 });
// Второй тик планировщика не создаёт вторую ссылку на то же занятие: гонка
// двух тиков/инстансов упирается в этот индекс (та же идея, что у deliveries,
// ADR-0004). Частичный — у recording/manual может быть несколько на занятие,
// а lesson_link без lessonId (ручная отправка ссылки) не должен упираться в
// ключ null. Отмена или сбой не освобождают ключ: повторная ссылка на то же
// занятие — обновление существующего документа, не новый (PLAN §4).
BroadcastSchema.index(
  { lessonId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'lesson_link', lessonId: { $type: 'objectId' } },
  },
);
// Тот же приём для recording (docs/PLAN.md §6 «Записи»): повтор addRecording
// с тем же url/file_id — обновление существующей рассылки записи, не новая.
// Частичный по kind: у lesson_link/manual поля recordingKey нет вовсе — им
// эта пара ключа не нужна и в индекс не попадают ($type: 'string' отсеивает
// undefined).
BroadcastSchema.index(
  { lessonId: 1, recordingKey: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: 'recording', recordingKey: { $type: 'string' } },
  },
);

export const BROADCAST_FIELD_POLICY: FieldPolicy = {
  text: enc,
  telegramFileId: plain('id видео в Telegram, доступ есть только у бота'),
  recordingKey: plain(
    'url или file_id записи, ключ идемпотентности; url публикуется в посте',
  ),
};
