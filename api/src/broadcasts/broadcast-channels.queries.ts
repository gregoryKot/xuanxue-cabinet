// Куда уйдёт занятие — вынесено из broadcast-planner.queries.ts (файл-лимит
// 150 строк, CLAUDE.md «Храповики»). Это решает только группа (ADR-0195):
// занятие уходит в каналы школы с той же группой. Занятие без группы, группа
// без канала, личный чат ученика и выключенный канал в отбор не попадают.
import type { Model, Types } from 'mongoose';
import type { ChannelRecord } from '../channels/channel.schema';
import { CANCEL_REASON } from './broadcast-cancel-reasons';

export interface RoutedClass {
  groupId?: Types.ObjectId;
  forAllGroups?: boolean;
}

/** Каналы занятия на момент отправки: занятие группы — каналы этой группы,
 * занятие «для всех групп» — все каналы школы, у которых группа есть. Занятие
 * без группы — пусто. */
export async function findGroupChannelIds(
  channelModel: Model<ChannelRecord>,
  cls: RoutedClass,
): Promise<Types.ObjectId[]> {
  const groupFilter = cls.forAllGroups
    ? { groupId: { $type: 'objectId' as const } }
    : cls.groupId
      ? { groupId: cls.groupId }
      : undefined;
  if (!groupFilter) return [];
  const docs = await channelModel
    .find({ ...groupFilter, active: true, broadcastEligible: { $ne: false } }, { _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  return docs.map((doc) => doc._id);
}

/** Почему пусто — причина отмены и текст учителю называют, что чинить: группу
 * у занятия или канал у группы. */
export function noChannelsReason(cls: RoutedClass): string {
  return cls.groupId || cls.forAllGroups
    ? CANCEL_REASON.groupWithoutChannel
    : CANCEL_REASON.noGroup;
}
