// Прежняя загрузка видео вопроса одним сырым телом — `POST /exam-videos`
// (ADR-0133). Остаётся на время перехода web на загрузку частями (ADR-0165,
// exam-video-uploads.service.ts) и уходит вместе с ним: ради этого она и вынесена
// из ExamVideosService целиком — убрать её значит удалить файл, а не править
// сервис. Порядок шагов — ADR-0079: журнал (`track`) раньше объекта в R2,
// `forget` — после того, как на объект сослались (запись создана).
import { randomUUID } from 'crypto';
import type { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import type { ExamVideoDto } from '@xuanxue/shared';
import type { FileStoreService } from '../storage/file-store.service';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { parseExamVideoUpload } from './exam-video-upload';
import { toExamVideoDto, type RawLeanExamVideo } from './exam-video.mapper';
import type { ExamVideoRecord } from './exam-video.schema';

// Готовое видео без загрузки частями: отпечаток схеме нужен, но продолжать тут
// нечего — resume ищет только `uploading`.
const RAW_FINGERPRINT_PREFIX = 'raw';

export interface RawUploadDeps {
  model: Model<ExamVideoRecord>;
  fileStore: FileStoreService;
  orphans: StorageOrphansService;
}

// createdBy необязателен — CLI-импорт сида грузит видео без вошедшего в
// систему человека, схема поля не требует (required: false).
export async function storeRawExamVideo(
  { model, fileStore, orphans }: RawUploadDeps,
  body: unknown,
  createdBy: string | undefined,
  now: DateTime,
): Promise<ExamVideoDto> {
  const { bytes, contentType } = parseExamVideoUpload(body);
  const key = `exam-videos/${randomUUID()}`;
  await orphans.track(key);
  await fileStore.put({ key, bytes, contentType, now });

  const created = await model.create({
    key,
    contentType,
    sizeBytes: bytes.length,
    status: 'ready',
    fingerprint: `${RAW_FINGERPRINT_PREFIX}:${key}`,
    ...(createdBy !== undefined ? { createdBy: new Types.ObjectId(createdBy) } : {}),
  });
  await orphans.forget(key);
  const doc = await model.findById(created._id).lean<RawLeanExamVideo>();
  if (!doc) {
    throw new Error('ExamVideosService.upload: запись не найдена сразу после создания');
  }
  return toExamVideoDto(doc);
}
