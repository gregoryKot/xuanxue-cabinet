// Единственный маппер AppErrorRecord (lean, уже расшифрованный) →
// AppErrorDto (CLAUDE.md «API»: документ Mongoose наружу не возвращается).
// Тот же приём, что grading-comment-preset.mapper.ts.
import type { Types } from 'mongoose';
import type { AppErrorDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { APP_ERROR_ENCRYPT_SCHEMA, type AppErrorRecord } from './app-error.schema';

/** AppErrorRecord как его отдаёт `.lean()` до расшифровки. */
export type RawLeanAppError = Pick<AppErrorRecord, keyof AppErrorRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function decryptAppError(doc: RawLeanAppError): RawLeanAppError {
  return decryptRecord(doc, APP_ERROR_ENCRYPT_SCHEMA);
}

export function toAppErrorDto(doc: RawLeanAppError): AppErrorDto {
  return {
    id: doc._id.toString(),
    requestId: doc.requestId,
    source: doc.source,
    kind: doc.kind,
    method: doc.method,
    path: doc.path,
    text: doc.text,
    userAgent: doc.userAgent,
    occurredAt: toIsoUtc(doc.occurredAt),
  };
}
