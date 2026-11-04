// Куда уйдёт занятие — вынесено из broadcast-planner.queries.ts (файл-лимит
// 150 строк, CLAUDE.md «Храповики»). Это решают только группы (ADR-0195,
// ADR-0196): занятие уходит в каналы школы, чьи группы пересекаются с его
// группами. Занятие без групп, группа без канала, личный чат ученика и
// выключенный канал в отбор не попадают; канал в ответе один раз, сколько бы
// общих групп у него ни было, — один пост на канал.
import type { Model, Types } from 'mongoose';
import type { ChannelRecord } from '../channels/channel.schema';
import { CANCEL_REASON } from './broadcast-cancel-reasons';

export interface RoutedClass {
  groupIds?: Types.ObjectId[];
}

/** Каналы занятия на момент отправки. `$in` отдаёт каждый документ один раз —
 * дубля канала нет и при нескольких общих группах. */
export async function findGroupChannelIds(
  channelModel: Model<ChannelRecord>,
  cls: RoutedClass,
): Promise<Types.ObjectId[]> {
  const groupIds = cls.groupIds ?? [];
  if (groupIds.length === 0) return [];
  const docs = await channelModel
    .find(
      { groupIds: { $in: groupIds }, active: true, broadcastEligible: { $ne: false } },
      { _id: 1 },
    )
    .lean<{ _id: Types.ObjectId }[]>();
  return docs.map((doc) => doc._id);
}

/** Почему пусто — причина отмены и текст учителю называют, что чинить: группы
 * у занятия или канал у группы. */
export function noChannelsReason(cls: RoutedClass): string {
  return (cls.groupIds ?? []).length > 0
    ? CANCEL_REASON.groupWithoutChannel
    : CANCEL_REASON.noGroup;
}
