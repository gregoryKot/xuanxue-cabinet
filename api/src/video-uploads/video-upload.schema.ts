// Состояние загрузки видео частями (ADR-0137, ADR-0165) — поля, общие для всех
// коллекций с видео-файлами в R2: `answer_videos` и (дальше) `exam_videos`.
// Коллекции остаются разными по причинам ADR-0137: у видео разные владелец,
// срок хранения и доступ, и это решает схема-наследник — владельцем, индексами,
// сроком. Здесь только то, что нужно ядру загрузки (video-uploads/): оно работает
// с любой схемой, которая наследует этот класс.
//
// Наследование — штатное для @nestjs/mongoose: DefinitionsFactory идёт по цепочке
// прототипов и подбирает свойства родителей, у которых есть `@Schema()`. Опции
// (`timestamps`, `collection`) и индексы объявляет схема-наследник.
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { EXAM_VIDEO_CONTENT_TYPES } from '@xuanxue/shared';
import type { ExamVideoContentType } from '@xuanxue/shared';
import { plain, type FieldPolicy } from '../common/field-policy';

const VIDEO_UPLOAD_STATUSES = ['uploading', 'ready'] as const;
export type VideoUploadStatus = (typeof VIDEO_UPLOAD_STATUSES)[number];

export interface VideoUploadPart {
  n: number;
  etag: string;
}

/** Часть, принятая R2 — номер и ETag, нужны в неизменном порядке для
 * `CompleteMultipartUpload` (multipart-store.service.ts). Тот же приём
 * субдокумента, что RecordingSubdoc (lessons/lesson.schema.ts). */
@Schema({ _id: false })
class VideoUploadPartSubdoc implements VideoUploadPart {
  @Prop({ type: Number, required: true })
  n!: number;

  @Prop({ type: String, required: true })
  etag!: string;
}
const VideoUploadPartSchema = SchemaFactory.createForClass(VideoUploadPartSubdoc);

@Schema()
export abstract class VideoUploadRecord {
  // Ключ объекта в R2 — случайный `<префикс>/<uuid>`, не персональные данные:
  // без подписанной ссылки не открыть (FileStoreService.signedGetUrl).
  @Prop({ type: String, required: true })
  key!: string;

  // Необязателен до первой части — определяется сигнатурой байтов
  // (sniffVideoSignature), не заголовком клиента (SECURITY §4).
  @Prop({ type: String, enum: EXAM_VIDEO_CONTENT_TYPES, required: false })
  contentType?: ExamVideoContentType;

  // Заявленный полный размер — по нему считается partCount и сверяется
  // размер каждой части.
  @Prop({ type: Number, required: true })
  sizeBytes!: number;

  // Размер и SHA-256 первого и последнего МиБ файла, без имени и даты
  // (ADR-0137, ADR-0165) — не персональные данные (хэш байтов видео), по нему
  // продолжается загрузка: те же байты к тому же месту — resume
  // (video-upload-start.ts).
  @Prop({ type: String, required: true })
  fingerprint!: string;

  @Prop({
    type: String,
    enum: VIDEO_UPLOAD_STATUSES,
    required: true,
    default: 'uploading',
  })
  status!: VideoUploadStatus;

  // UploadId R2 multipart — появляется на первой части, снимается на
  // `complete` ($unset): нет смысла держать закрытую загрузку.
  @Prop({ type: String, required: false })
  uploadId?: string;

  @Prop({ type: [VideoUploadPartSchema], default: [] })
  parts!: VideoUploadPart[];

  @Prop({ type: Date, required: false })
  completedAt?: Date;

  // R2 подтвердил сборку файла (CompleteMultipartUpload), остальные шаги
  // `complete` ещё идут (ADR-0165, F47 аудита 2026-10-01): по метке повтор
  // после сбоя Mongo не зовёт R2 второй раз — тот ответил бы NoSuchUpload, и
  // загрузка не завершилась бы никогда. Снимается ($unset) на `ready`
  // вместе с uploadId. Дата, не текст о человеке — шифрования не требует.
  @Prop({ type: Date, required: false })
  r2CompletedAt?: Date;
}

/** Решения о шифровании общих полей — одно место для всех схем-наследников
 * (encryption-coverage.spec.ts требует решение для каждого поля). Схема
 * разворачивает её в свою политику. */
export const VIDEO_UPLOAD_FIELD_POLICY: FieldPolicy = {
  key: plain(
    'случайный ключ объекта R2, не персональные данные — без подписанной ссылки не открыть',
  ),
  uploadId: plain('случайный id операции R2 multipart, не персональные данные'),
  fingerprint: plain(
    'размер и хэш первого и последнего мегабайта файла — числа, не текст о человеке',
  ),
  status: plain('перечисление, нужно для выборок'),
  'parts.etag': plain(
    'технический ETag части от R2, не текст о человеке — вложенное поле, enc/encJson тут не сработает',
  ),
};
