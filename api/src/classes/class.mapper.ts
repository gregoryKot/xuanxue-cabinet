// Единственный маппер ClassRecord (lean, уже расшифрованный) → ClassDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается).
import type { Types } from 'mongoose';
import type { ClassDto, ScheduleRuleDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { type ClassRecord, type LeanScheduleRule } from './class.schema';

/** ClassRecord с полями, которые Mongoose добавляет сам и не описывает в
 * `@Prop` (`_id`, `timestamps: true`), плюс правила в форме `.lean()`. */
export type LeanClass = Omit<ClassRecord, 'rules'> & {
  _id: Types.ObjectId;
  rules: LeanScheduleRule[];
  createdAt: Date;
  updatedAt: Date;
};

export function toClassDto(doc: LeanClass): ClassDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    groupLabel: doc.groupLabel,
    format: doc.format,
    location: doc.location,
    zoomLink: doc.zoomLink,
    zoomPassword: doc.zoomPassword,
    leaderId: doc.leaderId?.toString(),
    rules: doc.rules.map(toRuleDto),
    tz: doc.tz,
    channelIds: doc.channelIds.map((id) => id.toString()),
    leadMinutes: doc.leadMinutes,
    active: doc.active,
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}

function toRuleDto(rule: LeanScheduleRule): ScheduleRuleDto {
  return {
    id: rule._id.toString(),
    weekday: rule.weekday,
    time: rule.time,
    durationMin: rule.durationMin,
  };
}
