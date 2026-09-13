// Видео экзамена — способ добраться до него, не сами байты (ADR-0023,
// PLAN.md §11 слой 4.5): file_id/file_unique_id Telegram, ссылка на внешний
// хостинг или пометка «учитель принял вручную». Данные ученика (ADR-0010) —
// тот же чеклист CLAUDE.md «Новая коллекция с полем userId», что у
// exam_attempts/exam_gradings рядом.
//
// Уникальность: у попытки может быть много видео из Telegram («кружок» и
// обычное видео, повторная попытка снять получше) и много ручных отметок
// (учитель поправил подпись повторной отметкой) — без ограничения.
// Единственное ограничение — ссылка (`kind: 'link'`): одна на попытку,
// частичный уникальный индекс ниже защищает от гонки двух параллельных
// POST /media/link; повторная отправка получает понятный отказ
// (EXAM_MEDIA_ALREADY_LINKED_MESSAGE), а не тихий дубль, из которого потом
// непонятно, какую ссылку открывать.
//
// Срок хранения (PLAN §11 «Данные»): вместе с попыткой — запись уходит той
// же выборкой USER_OWNED_COLLECTIONS, что exam_attempts/exam_gradings.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';
import { EXAM_MEDIA_KINDS } from '@xuanxue/shared';
import type { ExamMediaKind } from '@xuanxue/shared';
import { enc, plain, encryptSchemaFrom, type FieldPolicy } from '../common/field-policy';

@Schema({ timestamps: true, collection: 'media_assets' })
export class MediaAssetRecord {
  // Группировка по попытке — не признак владения (это userId ниже), просто
  // ссылка, как examId у exam_gradings: без `ref`.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  attemptId!: Types.ObjectId;

  // Владение (чеклист CLAUDE.md, п.1) — ученик, чья попытка. Документ
  // целиком удаляется через USER_OWNED_COLLECTIONS, не $unset.
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: EXAM_MEDIA_KINDS, required: true })
  kind!: ExamMediaKind;

  // Ведёт к видео — шифруем (SECURITY §5), как токены каналов. Только
  // `kind: 'telegram'`. `fileId` действителен для конкретного бота
  // (ADR-0023) — `fileUniqueId` хранится рядом, чтобы после смены бота было
  // видно, что это то же самое видео, даже когда `fileId` уже не работает.
  @Prop({ type: String, required: false })
  fileId?: string;

  @Prop({ type: String, required: false })
  fileUniqueId?: string;

  // Только `kind: 'telegram'` — Telegram отдаёт их прямо в сообщении,
  // перекачивать видео ради длительности/размера не нужно (ADR-0023: `getFile`
  // не зовём вовсе). Числа — не текст, шифрования не требуют (SECURITY §5).
  @Prop({ type: Number, required: false })
  durationSec?: number;

  @Prop({ type: Number, required: false })
  sizeBytes?: number;

  // Только `kind: 'link'` — тоже ведёт к видео, шифруем.
  @Prop({ type: String, required: false })
  url?: string;

  // Короткая подпись — кто и как отметил вручную (`kind: 'manual'`), либо
  // пояснение к ссылке/видео. Свободный текст — шифруем.
  @Prop({ type: String, required: false })
  note?: string;

  @Prop({ type: Date, required: true })
  receivedAt!: Date;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAssetRecord);
// Все видео и отметки одной попытки, недавнее сверху — читает и
// ExamAttemptDto.media (владелец), и AttemptReviewDto.media (учитель).
MediaAssetSchema.index({ attemptId: 1, receivedAt: -1 });
// Удаление/перенос аккаунта (USER_OWNED_COLLECTIONS) — по владельцу.
MediaAssetSchema.index({ userId: 1 });
// Одна ссылка на попытку (см. комментарий в начале файла) — частичный
// индекс: ограничивает только kind: 'link', telegram/manual не задеты.
MediaAssetSchema.index(
  { attemptId: 1 },
  { unique: true, partialFilterExpression: { kind: 'link' } },
);

export const MEDIA_ASSET_FIELD_POLICY: FieldPolicy = {
  kind: plain('перечисление, нужно для выборок'),
  fileId: enc,
  fileUniqueId: enc,
  url: enc,
  note: enc,
};

/** Схема шифрования медиа — одна на все места чтения и записи
 * (MediaAssetsService): читающий запись мимо неё получит шифротекст вместо
 * fileId/url/note. */
export const MEDIA_ASSET_ENCRYPT_SCHEMA = encryptSchemaFrom(MEDIA_ASSET_FIELD_POLICY);
