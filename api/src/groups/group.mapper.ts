// Единственный маппер GroupRecord (lean) → GroupDto (CLAUDE.md, раздел «API»).
import type { Types } from 'mongoose';
import type { GroupDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { GroupRecord } from './group.schema';

export type LeanGroup = GroupRecord & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function toGroupDto(doc: LeanGroup, classCount: number): GroupDto {
  return {
    id: doc._id.toString(),
    name: doc.name,
    classCount,
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
