// Отбор каналов занятия в расписании для отправки — вынесено из
// broadcast-planner.queries.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
// Две ступени: активные каналы (CLAUDE.md «Только активные каналы»), из них —
// подходящие по тегу (ADR-0106). Обе причины отмены разные (broadcast-planner.
// send.ts, recording-broadcast.service.ts): «все каналы выключены» против
// «ни один канал не подписан на теги» — вызывающий должен их различать, не
// одна общая пустота.
import type { Model, Types } from 'mongoose';
import type { ChannelRecord } from '../channels/channel.schema';
import { channelAcceptsLessonTags } from '../channels/channel-tag-match';

export interface ChannelSelection {
  activeChannelIds: Types.ObjectId[];
  matchingChannelIds: Types.ObjectId[];
}

interface ChannelForTagMatch {
  _id: Types.ObjectId;
  tags?: string[];
}

/** Активные каналы занятия на момент отправки и из них — те, что подходят
 * по тегу занятия (свой тег даты + тег занятия в расписании, ADR-0106).
 * `lessonTags` — уже объединённый список, вызывающий сам решает, что в
 * него входит (broadcast-planner.send.ts, recording-broadcast.service.ts). */
export async function findChannelsForLesson(
  channelModel: Model<ChannelRecord>,
  channelIds: readonly Types.ObjectId[],
  lessonTags: readonly string[],
): Promise<ChannelSelection> {
  const docs = await channelModel
    .find({ _id: { $in: channelIds }, active: true }, { _id: 1, tags: 1 })
    .lean<ChannelForTagMatch[]>();
  const activeChannelIds = docs.map((doc) => doc._id);
  const matchingChannelIds = docs
    .filter((doc) => channelAcceptsLessonTags(doc.tags ?? [], lessonTags))
    .map((doc) => doc._id);
  return { activeChannelIds, matchingChannelIds };
}
