// Единственный маппер SchoolEventRecord (lean, уже расшифрованный) →
// SchoolEventDto (CLAUDE.md, раздел «API»: документ Mongoose наружу не
// возвращается).
import type { Types } from 'mongoose';
import type { SchoolEventDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  SCHOOL_EVENT_ENCRYPT_SCHEMA,
  type SchoolEventRecord,
} from './school-event.schema';

/** SchoolEventRecord как его отдаёт `.lean()` до расшифровки (тот же приём, что
 * у RawLeanGradingCommentPreset). */
export type RawLeanSchoolEvent = Pick<SchoolEventRecord, keyof SchoolEventRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function decryptSchoolEvent(doc: RawLeanSchoolEvent): RawLeanSchoolEvent {
  return decryptRecord(doc, SCHOOL_EVENT_ENCRYPT_SCHEMA);
}

export function toSchoolEventDto(doc: RawLeanSchoolEvent): SchoolEventDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    startsAt: toIsoUtc(doc.startsAt),
    endsAt: doc.endsAt ? toIsoUtc(doc.endsAt) : undefined,
    place: doc.place,
    description: doc.description,
    createdBy: doc.createdBy?.toString(),
    createdAt: toIsoUtc(doc.createdAt),
  };
}
