// Одна группа по id: проверяет, что она есть, и отдаёт название (ADR-0195).
// Общая для занятия (подпись `groupLabel`) и канала (только проверка): место
// одно, чтобы текст отказа и проверка не разошлись.
import type { Model, Types } from 'mongoose';
import { GROUP_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import type { GroupRecord } from './group.schema';

export interface ResolvedGroup {
  id: Types.ObjectId;
  name: string;
}

/** Группа есть — её id и название; нет — 400 с общим текстом групп. */
export async function resolveGroup(
  model: Model<GroupRecord>,
  id: string,
): Promise<ResolvedGroup> {
  const found = await model
    .findOne({ _id: id })
    .select('name')
    .lean<{ _id: Types.ObjectId; name: string }>();
  if (!found) throw new InvalidInputError(GROUP_NOT_FOUND_MESSAGE);
  return { id: found._id, name: found.name };
}
