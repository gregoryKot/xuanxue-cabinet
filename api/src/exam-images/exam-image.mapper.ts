// Маппер ExamImageRecord (lean) → ExamImageDto — байты в JSON не попадают
// никогда (ADR-0035): картинка отдаётся отдельным маршрутом
// (GET /api/exam-images/:id), не полем ответа.
import type { Types } from 'mongoose';
import type { ExamImageDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { ExamImageRecord } from './exam-image.schema';

/** ExamImageRecord как его отдаёт `.lean()` — тот же приём `Pick<T, keyof T>`,
 * что у RawLeanMediaAsset (media-asset.mapper.ts). */
export type RawLeanExamImage = Pick<ExamImageRecord, keyof ExamImageRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function toExamImageDto(doc: RawLeanExamImage): ExamImageDto {
  return {
    id: doc._id.toString(),
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    createdAt: toIsoUtc(doc.createdAt),
  };
}

interface WithBufferField {
  buffer: unknown;
}

function hasBufferField(value: unknown): value is WithBufferField {
  return typeof value === 'object' && value !== null && 'buffer' in value;
}

/** `.lean()` отдаёт Buffer-поле не как Buffer, а как `mongodb.Binary`
 * (`{ buffer: Uint8Array, sub_type, position }`) — проверено экспериментом
 * на этой версии Mongoose (9.9.x): гидрированный документ даёт настоящий
 * Buffer, `.lean()` — нет. Принимает оба случая и голый Uint8Array (на
 * случай будущего чтения мимо .lean()); всё остальное — программная
 * ошибка, не пользовательский случай. */
export function binaryToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (hasBufferField(value) && value.buffer instanceof Uint8Array) {
    return Buffer.from(value.buffer);
  }
  throw new Error('binaryToBuffer: неизвестный формат поля bytes (ни Buffer, ни Binary)');
}
