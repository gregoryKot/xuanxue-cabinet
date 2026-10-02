// Единственный маппер ExamVideoRecord (lean) → ExamVideoDto (CLAUDE.md
// «API»: документ Mongoose наружу не возвращается). `key` не уходит в DTO —
// адрес объекта в R2 не должен утечь мимо подписанной ссылки
// (FileStoreService.signedGetUrl).
import type { Types } from 'mongoose';
import type { ExamVideoContentType, ExamVideoDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { EXAM_VIDEO_ENCRYPT_SCHEMA, type ExamVideoRecord } from './exam-video.schema';

export type RawLeanExamVideo = Pick<ExamVideoRecord, keyof ExamVideoRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** Готово — всё, что не `uploading`: у видео, записанных до загрузки частями
 * (ADR-0165), поля `status` нет вовсе, а старый инстанс на деплое пишет такие
 * ещё и после миграции. Один предикат на выборки (фильтр ниже) и на документ. */
export const EXAM_VIDEO_READY_FILTER = { status: { $ne: 'uploading' as const } };

export function isExamVideoReady(doc: Pick<RawLeanExamVideo, 'status'>): boolean {
  return doc.status !== 'uploading';
}

/** Тип у готового видео есть всегда: его задаёт первая часть (она же открывает
 * загрузку) или прежняя сырая загрузка. Нет — повреждённая запись, и она не
 * должна молча уйти в бот или в плеер под выдуманным типом. */
export function readyContentType(doc: RawLeanExamVideo): ExamVideoContentType {
  if (!doc.contentType) {
    throw new Error(
      `exam_videos ${doc._id.toString()}: у готового видео нет contentType`,
    );
  }
  return doc.contentType;
}

/** `telegramFileId` расшифрован — тот же приём, что decryptExamImage
 * (exam-image.mapper.ts). DTO наружу (toExamVideoDto ниже) его не отдаёт —
 * ведёт к файлу у конкретного бота, наружу незачем. */
export function decryptExamVideo(doc: RawLeanExamVideo): RawLeanExamVideo {
  return decryptRecord(doc, EXAM_VIDEO_ENCRYPT_SCHEMA);
}

export function toExamVideoDto(doc: RawLeanExamVideo): ExamVideoDto {
  return {
    id: doc._id.toString(),
    contentType: readyContentType(doc),
    sizeBytes: doc.sizeBytes,
    createdAt: toIsoUtc(doc.createdAt),
  };
}
